const express = require("express");
const axios = require("axios");
const qs = require("qs");
require("dotenv").config();

const app = express();
app.use(express.json());

const {
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI,
} = process.env;

// Validate required environment variables
if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET || !LINKEDIN_REDIRECT_URI) {
  console.error("Missing required environment variables. Please check your .env file");
  process.exit(1);
}

// 🔗 Step 1: Redirect to LinkedIn for OAuth
app.get("/auth/linkedin", (req, res) => {
  const scope = "email w_member_social profile openid";
  const authURL = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}&scope=${encodeURIComponent(scope)}`;
  res.redirect(authURL);
});

// 🔄 Step 2: Handle LinkedIn callback
app.get("/auth/linkedin/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error(`LinkedIn OAuth error: ${error}`, error_description);
    return res.status(400).send(`Authentication failed: ${error_description}`);
  }

  // Validate code parameter
  if (!code) {
    return res.status(400).send("Missing required 'code' parameter");
  }

  try {
    const response = await axios.post("https://www.linkedin.com/oauth/v2/accessToken", qs.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: LINKEDIN_REDIRECT_URI,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    }), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const accessToken = response.data.access_token;

    console.log(accessToken);

    const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        family: 4, // Force IPv4
      });

      console.log(profileResponse.data);


    res.send(`Access token: ${accessToken}`);
    // Optionally redirect to a dashboard and store token securely
  } catch (error) {
    console.error("Token exchange error:", error.response?.data || error.message);
    res.status(500).send("Failed to get access token: " + (error.response?.data?.error_description || error.message));
  }
});

// 📝 Step 3: Create a LinkedIn Post
app.post("/linkedin/post", async (req, res) => {
  const { accessToken, text } = req.body;

  // Validate required input
  if (!accessToken || !text) {
    return res.status(400).json({ 
      error: "Missing required fields", 
      required: ["accessToken", "text"] 
    });
  }

  try {
    // Get user's info from userinfo endpoint
    const profileRes = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: { 
        Authorization: `Bearer ${accessToken}`
     },
    }).catch(error => {
      if (error.response?.status === 401) {
        throw new Error("Invalid or expired access token");
      }
      throw error;
    });
    
    console.log(profileRes.data);
    
    const sub = profileRes.data.sub; // This is the user's ID

    // Create a post
    const postBody = {
      author: `urn:li:person:${sub}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text,
          },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const postRes = await axios.post("https://api.linkedin.com/v2/ugcPosts", postBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202304",
      },
    });

    res.json({ success: true, postId: postRes.data.id });
  } catch (error) {
    console.error("Post creation error:", error.response?.data || error.message);
    res.status(500).json({ 
      error: "Failed to create post",
      details: error.response?.data || error.message 
    });
  }
});

app.listen(4242, () => console.log("Server running at http://localhost:4242"));

const axios = require('axios');

// Get Mistral API key from environment
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!MISTRAL_API_KEY) {
  console.error('Error: MISTRAL_API_KEY is not set in your environment variables');
  process.exit(1);
}

async function testMistralAPI() {
  try {
    console.log('Testing Mistral API connection...');

    // Test a simple models endpoint request
    const response = await axios({
      method: 'get',
      url: 'https://api.mistral.ai/v1/models',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('API connection successful!');
    console.log('Available models:');
    response.data.data.forEach(model => {
      console.log(`- ${model.id}`);
    });

    return true;
  } catch (error) {
    console.error('Error testing API connection:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(error.message);
    }
    return false;
  }
}

// Run the test
testMistralAPI();

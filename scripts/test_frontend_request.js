const axios = require('axios');

(async () => {
  try {
    const resp = await axios.post('http://localhost:8888/api/execute', {
      engine: 'python',
      code: 'print("Hello from simulated frontend")'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      timeout: 5000
    });
    console.log('STATUS:', resp.status);
    console.log('DATA:', resp.data);
  } catch (err) {
    if (err.response) {
      console.error('RESPONSE ERROR:', err.response.status, err.response.data);
    } else if (err.request) {
      console.error('NO RESPONSE, REQUEST SENT:', err.message);
    } else {
      console.error('REQUEST SETUP ERROR:', err.message);
    }
    process.exitCode = 1;
  }
})();

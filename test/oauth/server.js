const express = require('express');
const path = require('path');
const app = express();
const PORT = 4000;

// Serve static files from this directory
app.use(express.static(__dirname));

// Send the index.html for any request (SPA style)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\x1b[32m%s\x1b[0m`, `✓ Login Test Interface running at http://localhost:${PORT}`);
    console.log(`\x1b[33m%s\x1b[0m`, `Ensure your API Gateway is running on http://localhost:3000`);
});

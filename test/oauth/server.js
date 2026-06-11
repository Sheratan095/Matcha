const express = require('express');
const path = require('path');
const http = require('http');
const app = express();
const PORT = 4000;

// Gateway configuration
const GATEWAY_HOST = 'localhost';
const GATEWAY_PORT = 3000;

app.use(express.json());

// Serve static files from this directory
app.use(express.static(__dirname));

// Login proxy endpoint
app.post('/login', (req, res) => {
    const postData = JSON.stringify(req.body);

    const options = {
        hostname: GATEWAY_HOST,
        port: GATEWAY_PORT,
        path: '/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            // Forward the User-Agent and other useful headers
            'User-Agent': req.headers['user-agent']
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        let data = '';

        // Forward status code
        res.status(proxyRes.statusCode);

        // Forward set-cookie headers (critical for JWT)
        if (proxyRes.headers['set-cookie']) {
            res.setHeader('Set-Cookie', proxyRes.headers['set-cookie']);
        }

        proxyRes.on('data', (chunk) => {
            data += chunk;
        });

        proxyRes.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            res.send(data);
        });
    });

    proxyReq.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        res.status(500).json({ message: 'Internal Server Error connecting to Gateway' });
    });

    proxyReq.write(postData);
    proxyReq.end();
});

// Validate proxy endpoint
app.get('/validate', (req, res) => {
    const options = {
        hostname: GATEWAY_HOST,
        port: GATEWAY_PORT,
        path: '/auth/validate',
        method: 'GET',
        headers: {
            // Forward cookies and user-agent
            'Cookie': req.headers['cookie'] || '',
            'User-Agent': req.headers['user-agent']
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        let data = '';
        res.status(proxyRes.statusCode);

        proxyRes.on('data', (chunk) => {
            data += chunk;
        });

        proxyRes.on('end', () => {
            const contentType = proxyRes.headers['content-type'] || '';
            if (contentType.includes('application/json')) {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('credentials', 'include');
                res.send(data);
            } else {
                // If not JSON, wrap it anyway or send as is with JSON content type
                // but let's at least try to see if it's a 404 HTML
                if (proxyRes.statusCode === 404) {
                    res.status(404).json({ message: 'Endpoint not found on Gateway. Ensure Gateway is running on port 3000.' });
                } else {
                    res.setHeader('Content-Type', 'application/json');
                    res.send(JSON.stringify({ message: 'Gateway returned non-JSON response', status: proxyRes.statusCode, raw: data.substring(0, 100) }));
                }
            }
        });
    });

    proxyReq.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        res.status(503).json({ message: 'Gateway appears to be down. Check port 3000.', error: e.message });
    });

    proxyReq.end();
});

// Send the index.html for any request (SPA style)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\x1b[32m%s\x1b[0m`, `✓ Login Test Interface running at http://localhost:${PORT}`);
    console.log(`\x1b[33m%s\x1b[0m`, `Ensure your API Gateway is running on http://localhost:3000`);
});

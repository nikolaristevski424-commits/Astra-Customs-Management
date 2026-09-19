const https = require('https');

/** Download a URL into a Buffer. Used anywhere we need to re-process or re-post a file/image. */
function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (res.statusCode >= 400) return reject(new Error(`Download failed with status ${res.statusCode}`));
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            })
            .on('error', reject);
    });
}

module.exports = { downloadBuffer };

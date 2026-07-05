const http = require('http');
const puppeteer = require('puppeteer');

// 1. Maintain the web server layer to ensure Render stays alive for free
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Real Aviator Data Gateway is Online!');
}).listen(process.env.PORT || 3000);

async function runLiveTracker() {
    console.log('Launching headless automation framework...');
    
    // Launch Chrome with optimization configurations for server environments
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // 2. Instruct the engine to read console statements directly out of the game window
    page.on('console', msg => {
        const text = msg.text();
        
        // This targets the exact string emitted by the production client engine when a round terminates
        if (text.includes('"type":"crash"') || text.includes('flew_away') || text.includes('multiplier')) {
            console.log('REAL TIME DATA CAPTURED:', text);
        }
    });

    try {
        console.log('Navigating to game frame environment...');
        // 3. TARGET THE LIVE PRODUCTION URL 
        // Replace this placeholder link with the actual URL inside your target operator's iframe wrapper
        await page.goto('https://aviator-next.spribegaming.com/game/index.html', {
            waitUntil: 'networkidle2',
            timeout: 0
        });
    } catch (err) {
        console.error('Session failed: ', err.message);
        await browser.close();
        setTimeout(runLiveTracker, 10000); // Retry loop initialization upon failure
    }
}

runLiveTracker();

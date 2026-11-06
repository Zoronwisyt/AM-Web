const { spawn } = require('child_process');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9244',
  'file:///C:/Users/jeduc/Downloads/Test2/alight-motion/index.html'
]);

setTimeout(async () => {
  const tabsRes = await fetch('http://127.0.0.1:9244/json');
  const tabs = await tabsRes.json();
  const pageTab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = id++;
    const handler = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  ws.onopen = async () => {
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 1000));

    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        const W = 1080, H = 1080;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(200, 200, 680, 680);

        // Before fix: cv width is 300x150
        FXEngine.init(); console.log('Initial cv size:', FXEngine.cv.width, FXEngine.cv.height);

        // Resize cv to match W, H:
        FXEngine.cv.width = W;
        FXEngine.cv.height = H;

        const entry = FXEngine.makeEntry('com.alightcreative.effects.boxblur3');
        const out = FXEngine.processLayer(c, [entry], {
          W, H, layerW: W, layerH: H, pad: 0, time: 0, compTex: null
        });

        const octx = out.getContext('2d');
        const imgData = octx.getImageData(0, 0, W, H).data;
        let nonZero = 0;
        for (let i = 0; i < imgData.length; i += 4) {
          if (imgData[i+3] > 0) nonZero++;
        }

        return JSON.stringify({
          outWidth: out.width,
          outHeight: out.height,
          cvWidth: FXEngine.cv.width,
          cvHeight: FXEngine.cv.height,
          nonZeroPixels: nonZero,
          centerPixel: [imgData[540*W*4 + 540*4], imgData[540*W*4 + 540*4 + 1], imgData[540*W*4 + 540*4 + 2], imgData[540*W*4 + 540*4 + 3]]
        });
      })()`,
      returnByValue: true
    });
    console.log('res:', JSON.stringify(res));
    chrome.kill();
    process.exit(0);
  };
}, 2000);

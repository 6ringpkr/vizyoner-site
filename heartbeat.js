const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');

const app = express();
const PORT = 8085;

// Replace with your actual subscriptions storage
let subscriptions = []; // You should persist this in a real app

// VAPID keys
webpush.setVapidDetails(
  'mailto:vzymb2xxx@gmail.com',
  'BGAq623vEDEL-ISsEZZRJyBVOssH6iVUmil3S0R3pr6qBTKq_3S5FFr99Plg9DIF8268XLbW0ss0RzK00afmTXA',
  'Uvrd9Rg63lc4q0H4YRjKWNe-IPLaycpq7F_vfHJAwTg'
);

app.use(bodyParser.json());

// Endpoint to receive and store push subscriptions from frontend
app.post('/api/subscribe', (req, res) => {
  const sub = req.body;
  if (sub && !subscriptions.find(s => s.endpoint === sub.endpoint)) {
    subscriptions.push(sub);
    console.log('New subscription:', sub.endpoint);
  }
  res.status(201).json({});
});

// Endpoint to trigger heartbeat push
app.post('/api/heartbeat', (req, res) => {
  sendHeartbeat(subscriptions);
  res.json({ ok: true });
});

function sendHeartbeat(subscriptions) {
  const payload = JSON.stringify({
    title: 'Heartbeat',
    body: 'This is a heartbeat notification to all devices.'
  });

  subscriptions.forEach(sub => {
    webpush.sendNotification(sub, payload).catch(err => console.error(err));
  });
}

app.listen(PORT, () => {
  console.log(`Heartbeat server running on http://127.0.0.1:${PORT}`);
});
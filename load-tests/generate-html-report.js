#!/usr/bin/env node

/**
 * Artillery HTML Report Generator
 * Converts Artillery JSON report to interactive HTML dashboard
 *
 * Usage: node generate-html-report.js <input.json> [output.html]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateReport(jsonFile, htmlFile) {
  if (!fs.existsSync(jsonFile)) {
    console.error(`Error: Report file not found: ${jsonFile}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const stats = data.aggregate;
  const counters = stats.counters || {};
  const summaries = stats.summaries || {};

  // Calculate key metrics
  const totalRequests = counters['http.requests'] || 0;
  const totalResponses = counters['http.responses'] || 0;
  const totalErrors = counters['errors.Failed capture or match'] || 0;

  // Aggregate status codes by range
  let rate2xx = 0;
  let rate4xx = 0;
  let rate5xx = 0;
  let rate429 = 0;

  for (const [key, value] of Object.entries(counters)) {
    if (key.startsWith('http.codes.')) {
      const code = parseInt(key.split('.')[2]);
      if (code === 429) {
        rate429 += value;
      } else if (code >= 200 && code < 300) {
        rate2xx += value;
      } else if (code >= 400 && code < 500) {
        rate4xx += value;
      } else if (code >= 500 && code < 600) {
        rate5xx += value;
      }
    }
  }

  const failed = counters['vusers.failed'] || 0;
  const completed = counters['vusers.completed'] || 0;

  const responseTime = summaries['http.response_time'] || {};
  const latency = {
    min: Math.round(responseTime.min || 0),
    max: Math.round(responseTime.max || 0),
    mean: Math.round(responseTime.mean || 0),
    p50: Math.round(responseTime.p50 || 0),
    p95: Math.round(responseTime.p95 || 0),
    p99: Math.round(responseTime.p99 || 0),
  };

  const testStartTime = stats.firstCounterAt ? new Date(stats.firstCounterAt).toLocaleString() : 'Unknown';
  const testEndTime = stats.lastCounterAt ? new Date(stats.lastCounterAt).toLocaleString() : 'Unknown';
  const testDuration = stats.lastCounterAt && stats.firstCounterAt
    ? Math.round((stats.lastCounterAt - stats.firstCounterAt) / 1000)
    : 0;

  // Detect rate limiting
  const rateLimitHit = rate429 > 0;
  const rateLimitPercentage = totalRequests > 0 ? Math.round((rate429 / totalRequests) * 100) : 0;

  // Get scenario breakdown
  const scenarios = {};
  for (const [key, value] of Object.entries(counters)) {
    const match = key.match(/vusers\.created_by_name\.(.+)/);
    if (match) {
      scenarios[match[1]] = value;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artillery Load Test Report</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .content {
            padding: 40px;
        }
        .test-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .info-card {
            padding: 15px;
            background: white;
            border-left: 4px solid #667eea;
            border-radius: 4px;
        }
        .info-card.warning {
            border-left-color: #ff9800;
        }
        .info-card.danger {
            border-left-color: #f44336;
        }
        .info-card label {
            display: block;
            font-size: 0.85em;
            color: #666;
            margin-bottom: 5px;
            text-transform: uppercase;
            font-weight: 600;
        }
        .info-card .value {
            font-size: 1.8em;
            font-weight: bold;
            color: #333;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .metric-box {
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            text-align: center;
        }
        .metric-box h3 {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 10px;
            text-transform: uppercase;
            font-weight: 600;
        }
        .metric-box .number {
            font-size: 2.2em;
            font-weight: bold;
            color: #667eea;
        }
        .metric-box.error .number {
            color: #f44336;
        }
        .metric-box.warning .number {
            color: #ff9800;
        }
        .metric-box.success .number {
            color: #4caf50;
        }
        .charts {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
            gap: 30px;
            margin-bottom: 40px;
        }
        .chart-container {
            position: relative;
            height: 300px;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
        }
        .chart-container h3 {
            margin-bottom: 15px;
            color: #333;
            font-size: 1.1em;
        }
        .rate-limit-alert {
            background: #fff3e0;
            border-left: 4px solid #ff9800;
            padding: 20px;
            margin-bottom: 30px;
            border-radius: 4px;
        }
        .rate-limit-alert.critical {
            background: #ffebee;
            border-left-color: #f44336;
        }
        .rate-limit-alert h3 {
            color: #e65100;
            margin-bottom: 10px;
        }
        .rate-limit-alert.critical h3 {
            color: #c62828;
        }
        .rate-limit-alert p {
            color: #555;
            line-height: 1.6;
        }
        .stats-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 30px;
        }
        .stats-table th {
            background: #667eea;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        .stats-table td {
            padding: 12px;
            border-bottom: 1px solid #eee;
        }
        .stats-table tr:hover {
            background: #f8f9fa;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
            border-top: 1px solid #eee;
        }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
            margin-right: 8px;
        }
        .badge.success {
            background: #c8e6c9;
            color: #2e7d32;
        }
        .badge.warning {
            background: #ffe0b2;
            color: #e65100;
        }
        .badge.error {
            background: #ffcdd2;
            color: #c62828;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Artillery Load Test Report</h1>
            <p>Performance Analysis & Load Testing Results</p>
        </div>

        <div class="content">
            ${rateLimitHit ? `
            <div class="rate-limit-alert ${rateLimitPercentage > 20 ? 'critical' : ''}">
                <h3>⚠️  Rate Limiting Detected!</h3>
                <p><strong>${rate429} requests (${rateLimitPercentage}%)</strong> received HTTP 429 (Too Many Requests) responses.</p>
                <p>The server rate limiting kicked in during this test. Consider reducing load intensity or increasing time between requests.</p>
            </div>
            ` : ''}

            <div class="test-info">
                <div class="info-card">
                    <label>Test Duration</label>
                    <div class="value">${testDuration}s</div>
                </div>
                <div class="info-card">
                    <label>Total Requests</label>
                    <div class="value">${totalRequests.toLocaleString()}</div>
                </div>
                <div class="info-card ${failed > 0 ? 'warning' : ''}">
                    <label>Failed Sessions</label>
                    <div class="value">${failed}</div>
                </div>
                <div class="info-card ${rateLimitHit ? 'danger' : ''}">
                    <label>Rate Limit (429)</label>
                    <div class="value">${rate429}</div>
                </div>
                <div class="info-card">
                    <label>Started</label>
                    <div class="value" style="font-size: 0.9em;">${testStartTime}</div>
                </div>
                <div class="info-card">
                    <label>Completed</label>
                    <div class="value" style="font-size: 0.9em;">${testEndTime}</div>
                </div>
            </div>

            <h2 style="margin: 40px 0 20px 0;">Performance Metrics</h2>
            <div class="metrics-grid">
                <div class="metric-box">
                    <h3>Min Latency</h3>
                    <div class="number">${latency.min}ms</div>
                </div>
                <div class="metric-box">
                    <h3>Mean Latency</h3>
                    <div class="number">${latency.mean}ms</div>
                </div>
                <div class="metric-box">
                    <h3>P95 Latency</h3>
                    <div class="number">${latency.p95}ms</div>
                </div>
                <div class="metric-box">
                    <h3>Max Latency</h3>
                    <div class="number">${latency.max}ms</div>
                </div>
                <div class="metric-box success">
                    <h3>Successful (2xx)</h3>
                    <div class="number">${rate2xx}</div>
                </div>
                <div class="metric-box warning">
                    <h3>Client Errors (4xx)</h3>
                    <div class="number">${rate4xx}</div>
                </div>
                <div class="metric-box error">
                    <h3>Server Errors (5xx)</h3>
                    <div class="number">${rate5xx}</div>
                </div>
                <div class="metric-box">
                    <h3>Success Rate</h3>
                    <div class="number">${totalResponses > 0 ? Math.round((rate2xx / totalResponses) * 100) : 0}%</div>
                </div>
            </div>

            <h2 style="margin: 40px 0 20px 0;">Response Distribution & Latency</h2>
            <div class="charts">
                <div class="chart-container">
                    <h3>Status Code Distribution</h3>
                    <canvas id="statusChart"></canvas>
                </div>
                <div class="chart-container">
                    <h3>Latency Percentiles</h3>
                    <canvas id="latencyChart"></canvas>
                </div>
            </div>

            <h2 style="margin: 40px 0 20px 0;">Scenario Breakdown</h2>
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Scenario</th>
                        <th>Virtual Users Created</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(scenarios).map(([name, count]) => {
                        const total = Object.values(scenarios).reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        return '<tr><td><strong>' + name + '</strong></td><td>' + count + '</td><td>' + pct + '%</td></tr>';
                    }).join('')}
                </tbody>
            </table>

            <div class="footer">
                <p>Generated on ${new Date().toLocaleString()}</p>
                <p>Report data from: ${path.basename(jsonFile)}</p>
            </div>
        </div>
    </div>

    <script>
        // Status Code Chart
        const statusCtx = document.getElementById('statusChart').getContext('2d');
        new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['2xx Success', '4xx Client Error', '5xx Server Error', '429 Rate Limit'],
                datasets: [{
                    data: [${rate2xx}, ${rate4xx}, ${rate5xx}, ${rate429}],
                    backgroundColor: ['#4caf50', '#ff9800', '#f44336', '#2196f3'],
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });

        // Latency Chart
        const latencyCtx = document.getElementById('latencyChart').getContext('2d');
        new Chart(latencyCtx, {
            type: 'bar',
            data: {
                labels: ['Min', 'p50', 'Mean', 'p95', 'p99', 'Max'],
                datasets: [{
                    label: 'Response Time (ms)',
                    data: [${latency.min}, ${latency.p50}, ${latency.mean}, ${latency.p95}, ${latency.p99}, ${latency.max}],
                    backgroundColor: '#667eea',
                    borderRadius: 4,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'x',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    </script>
</body>
</html>`;

  fs.writeFileSync(htmlFile, html);
  console.log(`✅ HTML report generated: ${htmlFile}`);
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node generate-html-report.js <input.json> [output.html]');
  process.exit(1);
}

const jsonFile = args[0];
const htmlFile = args[1] || jsonFile.replace('.json', '.html');
generateReport(jsonFile, htmlFile);

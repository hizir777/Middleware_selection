#!/usr/bin/env node

// ═══════════════════════════════════════════════════════
// Performance Test Script
// ═══════════════════════════════════════════════════════
// Node bunu çalıştır:
// npm run performance:test
//
// Veya direct:
// node scripts/performance-test.js
// ═══════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const NUMBER_OF_REQUESTS = 1000;
const CONCURRENCY = 100;

const results = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  latencies: [],
  startTime: null,
  endTime: null,
};

async function makeRequest(url, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 10000,
    });
    const latency = Date.now() - start;

    results.latencies.push(latency);

    if (res.ok || res.status === 401 || res.status === 429) {
      results.successfulRequests++;
    } else {
      results.failedRequests++;
    }

    return { status: res.status, latency };
  } catch (err) {
    const latency = Date.now() - start;
    results.latencies.push(latency);
    results.failedRequests++;
    return { error: err.message, latency };
  }
}

async function runConcurrentRequests(count, fn) {
  const batches = Math.ceil(count / CONCURRENCY);
  for (let i = 0; i < batches; i++) {
    const batch = [];
    for (let j = 0; j < Math.min(CONCURRENCY, count - i * CONCURRENCY); j++) {
      batch.push(fn());
    }
    await Promise.all(batch);
  }
}

async function runPerformanceTest() {
  console.log('═══════════════════════════════════════════════');
  console.log('📊 Performance Test — Middleware Selection');
  console.log('═══════════════════════════════════════════════\n');

  console.log(`🎯 Configuration:`);
  console.log(`   Total Requests: ${NUMBER_OF_REQUESTS}`);
  console.log(`   Concurrency: ${CONCURRENCY}`);
  console.log(`   Base URL: ${BASE_URL}\n`);

  results.startTime = Date.now();

  // Test 1: Health Check (baseline)
  console.log('🏥 Test 1: Health Check (Baseline)');
  results.totalRequests = 0;
  results.successfulRequests = 0;
  results.failedRequests = 0;
  results.latencies = [];

  await runConcurrentRequests(NUMBER_OF_REQUESTS, () => makeRequest(`${BASE_URL}/api/health`));

  const healthCheckStats = calculateStats();
  console.log(`   ✅ Success: ${results.successfulRequests}/${results.totalRequests}`);
  console.log(`   📈 p50: ${healthCheckStats.p50}ms`);
  console.log(`   📈 p95: ${healthCheckStats.p95}ms`);
  console.log(`   📈 p99: ${healthCheckStats.p99}ms\n`);

  // Test 2: Login Endpoint (Auth)
  console.log('🔐 Test 2: Login Endpoint (With Auth)');
  results.totalRequests = 0;
  results.successfulRequests = 0;
  results.failedRequests = 0;
  results.latencies = [];

  await runConcurrentRequests(100, () =>
    makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: { email: 'test@example.com', password: 'wrongpassword' },
    })
  );

  const loginStats = calculateStats();
  console.log(`   ✅ Requests: ${results.totalRequests}`);
  console.log(`   📈 p50: ${loginStats.p50}ms`);
  console.log(`   📈 p95: ${loginStats.p95}ms`);
  console.log(`   📈 p99: ${loginStats.p99}ms\n`);

  // Test 3: Protected Route (with token)
  console.log('🔒 Test 3: Protected Route (Token Required)');

  // First, get a valid token
  let validToken = null;
  try {
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `perf_test_${Date.now()}`,
        email: `perf_test_${Date.now()}@example.com`,
        password: 'TestPassword123',
      }),
    });

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `perf_test_${Date.now()}@example.com`,
        password: 'TestPassword123',
      }),
    });

    const loginData = await loginRes.json();
    validToken = loginData.token;
  } catch (err) {
    console.log('   ⚠️ Could not get token for test\n');
  }

  if (validToken) {
    results.totalRequests = 0;
    results.successfulRequests = 0;
    results.failedRequests = 0;
    results.latencies = [];

    await runConcurrentRequests(100, () =>
      makeRequest(`${BASE_URL}/api/dashboard`, {
        headers: { Authorization: `Bearer ${validToken}` },
      })
    );

    const protectedStats = calculateStats();
    console.log(`   ✅ Requests: ${results.totalRequests}`);
    console.log(`   📈 p50: ${protectedStats.p50}ms`);
    console.log(`   📈 p95: ${protectedStats.p95}ms`);
    console.log(`   📈 p99: ${protectedStats.p99}ms\n`);
  }

  results.endTime = Date.now();

  // Summary
  console.log('═══════════════════════════════════════════════');
  console.log('📋 Summary');
  console.log('═══════════════════════════════════════════════');
  console.log(`Total Duration: ${results.endTime - results.startTime}ms`);
  console.log(`Requests/sec: ${(3 * NUMBER_OF_REQUESTS) / ((results.endTime - results.startTime) / 1000)}`);

  // Save results
  const reportDir = path.join(__dirname, '../performance-results');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(reportDir, `perf-${new Date().toISOString()}.json`),
    JSON.stringify(results, null, 2)
  );

  console.log(`\n✅ Results saved to: ${reportDir}`);
}

function calculateStats() {
  const sorted = [...results.latencies].sort((a, b) => a - b);
  const count = sorted.length;

  return {
    min: sorted[0],
    max: sorted[count - 1],
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / count),
    p50: sorted[Math.floor(count * 0.5)],
    p95: sorted[Math.floor(count * 0.95)],
    p99: sorted[Math.floor(count * 0.99)],
  };
}

// Run test
runPerformanceTest().catch(console.error);

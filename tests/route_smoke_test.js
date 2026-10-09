const fs = require('fs');
const path = require('path');

console.log('----------------------------------------------------');
console.log('RUNNING MOBILE APP ROUTE SMOKE & INTEGRITY TESTS');
console.log('----------------------------------------------------');

const appDir = path.join(__dirname, '..', 'apps', 'mobile', 'app');
const expectedRoutes = [
  'splash.tsx',
  'login.tsx',
  '_layout.tsx',
  '(tabs)/_layout.tsx',
  '(tabs)/index.tsx',
  '(tabs)/followups.tsx',
  '(tabs)/voice.tsx',
  '(tabs)/profile.tsx',
  '(tabs)/sync.tsx',
  'onboarding/index.tsx',
  'patients/index.tsx',
  'patients/_layout.tsx',
  'patients/new.tsx',
  'patients/high-risk.tsx',
  'patients/[id].tsx',
  'screening/voice-capture.tsx',
  'screening/summary.tsx',
  'screening/manual-entry.tsx',
  'village/index.tsx'
];

let passed = 0;

// Test 1: Route existence and default export validation
for (const route of expectedRoutes) {
  const filePath = path.join(appDir, route);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[FAIL] Route file missing: ${route}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('export default')) {
    throw new Error(`[FAIL] Route file missing default export: ${route}`);
  }
}
passed++;
console.log(`[PASS] Test 1: All ${expectedRoutes.length} route files exist with valid default exports`);

// Test 2: Route ordering in root _layout.tsx (ISS-018 / ISS-146)
const rootLayoutPath = path.join(appDir, '_layout.tsx');
const rootLayoutContent = fs.readFileSync(rootLayoutPath, 'utf8');
const highRiskIndex = rootLayoutContent.indexOf('name="patients/high-risk"');
const dynamicIdIndex = rootLayoutContent.indexOf('name="patients/[id]"');

if (highRiskIndex === -1 || dynamicIdIndex === -1) {
  throw new Error('[FAIL] patients/high-risk or patients/[id] not declared in _layout.tsx');
}

if (highRiskIndex > dynamicIdIndex) {
  throw new Error('[FAIL] Routing conflict: patients/[id] declared before patients/high-risk!');
}
passed++;
console.log('[PASS] Test 2: Route order verified: static routes precede dynamic routes');

// Test 3: Expo Router queryString patch verification (ISS-018 / ISS-154)
const patchCheckFiles = [
  path.join(__dirname, '..', 'node_modules', 'expo-router', 'build', 'fork', 'getPathFromState.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-router', 'build', 'fork', 'getPathFromState-forks.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-router', 'build', 'global-state', 'routeInfo.js'),
];

for (const patchFile of patchCheckFiles) {
  if (fs.existsSync(patchFile)) {
    const patchContent = fs.readFileSync(patchFile, 'utf8');
    if (!patchContent.includes('stringifyFn')) {
      throw new Error(`[FAIL] Unpatched Expo Router file detected: ${patchFile}`);
    }
  }
}
passed++;
console.log('[PASS] Test 3: Expo Router queryString patch verified across target fork files');

// Test 4 (ISS-021): Live route push execution through Expo Router's serializer
// Exercises getPathDataFromState and queryString.stringify across exact routes that crashed release build
{
  const navPath = require.resolve('@react-navigation/native');
  require.cache[navPath] = {
    id: navPath,
    filename: navPath,
    loaded: true,
    exports: { validatePathConfig: () => {} }
  };

  const { getPathFromState } = require('expo-router/build/fork/getPathFromState');
  const { appendQueryAndHash } = require('expo-router/build/fork/getPathFromState-forks');

  // Push 1: /(tabs) -> /patients (Patients tile tap that crashed release APK)
  const path1 = getPathFromState({ routes: [{ name: 'patients' }] });
  if (!path1.includes('/patients')) {
    throw new Error(`[FAIL] Failed serializing /patients route push, got: ${path1}`);
  }

  // Push 2: /(tabs) -> /screening/voice-capture (Start Field Visit button tap with params)
  const path2 = getPathFromState({
    routes: [{
      name: 'screening/voice-capture',
      params: { scenarioId: 'ncd-severe-bp', autoStart: 'true' }
    }]
  });
  if (!path2.includes('scenarioId=ncd-severe-bp')) {
    throw new Error(`[FAIL] Query string serialization failed on voice-capture push, got: ${path2}`);
  }

  // Push 3: Summary route with nested clinical params
  const path3 = getPathFromState({
    routes: [{
      name: 'screening/summary',
      params: { patientId: 'p-001', screeningType: 'ncd' }
    }]
  });
  if (!path3.includes('patientId=p-001')) {
    throw new Error(`[FAIL] Query string serialization failed on summary push, got: ${path3}`);
  }

  // Push 4: appendQueryAndHash with multiple params
  const path4 = appendQueryAndHash('/patients/high-risk', { priority: 'high', status: 'pending' });
  if (!path4.includes('priority=high')) {
    throw new Error(`[FAIL] appendQueryAndHash failed, got: ${path4}`);
  }

  passed++;
  console.log('[PASS] Test 4: Live route push serialization executed without crash across all target routes (ISS-021)');
}

console.log('----------------------------------------------------');
console.log(`ALL ROUTE SMOKE TESTS PASSED (${passed}/${passed})`);
console.log('----------------------------------------------------');

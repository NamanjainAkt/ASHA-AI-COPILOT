const fs = require('fs');
const path = require('path');

const filesToPatch = [
  path.join(__dirname, '..', 'node_modules', 'expo-router', 'build', 'fork', 'getPathFromState.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-router', 'build', 'fork', 'getPathFromState-forks.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-router', 'build', 'global-state', 'routeInfo.js'),
];

const expoRouterPkg = path.join(__dirname, '..', 'node_modules', 'expo-router', 'package.json');
if (!fs.existsSync(expoRouterPkg)) {
  console.log('expo-router not installed yet in node_modules, skipping patch.');
  process.exit(0);
}

for (const file of filesToPatch) {
  if (!fs.existsSync(file)) {
    throw new Error(`[CRITICAL] Target file for Expo Router patch is missing: ${file}`);
  }
  let content = fs.readFileSync(file, 'utf8');

  // Patch 1: getPathFromState.js
  if (file.endsWith('getPathFromState.js')) {
    const target = 'const query = queryString.stringify(focusedParams, { sort: false });';
    const replacement = `const stringifyFn = queryString.stringify || queryString.default?.stringify;
            const query = typeof stringifyFn === 'function' ? stringifyFn(focusedParams, { sort: false }) : '';`;
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(file, content, 'utf8');
      console.log('Patched getPathFromState.js successfully.');
    }
  }

  // Patch 2: getPathFromState-forks.js
  if (file.endsWith('getPathFromState-forks.js')) {
    const target = 'const query = queryString.stringify(focusedParams, { sort: false });';
    const replacement = `const stringifyFn = queryString.stringify || queryString.default?.stringify;
    const query = typeof stringifyFn === 'function' ? stringifyFn(focusedParams, { sort: false }) : '';`;
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(file, content, 'utf8');
      console.log('Patched getPathFromState-forks.js successfully.');
    }
  }

  // Patch 3: routeInfo.js
  if (file.endsWith('routeInfo.js')) {
    const target = 'const query = queryString.stringify(allParams, { sort: false });';
    const replacement = `const stringifyFn = queryString.stringify || queryString.default?.stringify;
    const query = typeof stringifyFn === 'function' ? stringifyFn(allParams, { sort: false }) : '';`;
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(file, content, 'utf8');
      console.log('Patched routeInfo.js successfully.');
    }
  }

  // Verify that the patch exists
  const updatedContent = fs.readFileSync(file, 'utf8');
  if (!updatedContent.includes('stringifyFn')) {
    throw new Error(`[CRITICAL] Patch verification failed! File does not contain stringifyFn guard: ${file}`);
  }
}
console.log('Expo Router patches verified.');

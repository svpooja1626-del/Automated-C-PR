const fs = require('fs');
const https = require('https');

// Clean comments and strings from C# code line to avoid false positives
function cleanCode(line) {
  let clean = line.replace(/"([^"\\]|\\.)*"/g, '""'); // Strip double-quoted strings
  clean = clean.replace(/'([^'\\]|\\.)*'/g, "''"); // Strip single-quoted strings
  clean = clean.split('//')[0]; // Strip single line comments
  return clean;
}

// Analyze a line of C# code for code smells
function analyzeLine(clean, filepath, lineNumber) {
  const findings = [];

  // 1. ASYNC CHECKS
  // Async void
  if (/\basync\s+void\b/.test(clean)) {
    findings.push({
      file: filepath,
      line: lineNumber,
      category: 'async',
      severity: 'warning',
      message: "Avoid using 'async void' except for event handlers. Use 'async Task' to allow callers to await the method and handle exceptions properly."
    });
  }

  // Blocking async call
  const blockingMatch = clean.match(/\.(Result\b|Wait\(\)|GetAwaiter\(\)\.GetResult\(\))/);
  if (blockingMatch) {
    findings.push({
      file: filepath,
      line: lineNumber,
      category: 'async',
      severity: 'warning',
      message: `Blocking on an async task using '.${blockingMatch[1]}' can cause thread pool starvation or deadlocks. Use 'await' instead.`
    });
  }

  // Unawaited async call
  const asyncCallMatch = clean.match(/\b([A-Za-z0-9_]+Async)\s*\(/);
  if (asyncCallMatch) {
    // Check that the line does not contain await, return, assignment, yield, and does not look like a declaration
    const isDecl = /\b(public|private|protected|internal|void|Task|class|interface|new|using|namespace)\b/.test(clean);
    if (!isDecl && !clean.includes('await') && !clean.includes('return') && !clean.includes('=') && !clean.includes('yield')) {
      findings.push({
        file: filepath,
        line: lineNumber,
        category: 'async',
        severity: 'warning',
        message: `Async method '${asyncCallMatch[1]}' is called without being awaited or its Task handled. Unhandled exceptions from this call may be lost.`
      });
    }
  }

  // 2. NULL-HANDLING CHECKS
  // Swallowing NullReferenceException
  if (/catch\s*\(\s*NullReferenceException/.test(clean)) {
    findings.push({
      file: filepath,
      line: lineNumber,
      category: 'null-handling',
      severity: 'warning',
      message: "Catching NullReferenceException is highly discouraged. It usually indicates a design smell or a bug that should be resolved by checking for null before accessing members."
    });
  }

  // Null-forgiving operator
  if (/\b[A-Za-z0-9_]+!\.[A-Za-z0-9_]+\b/.test(clean)) {
    findings.push({
      file: filepath,
      line: lineNumber,
      category: 'null-handling',
      severity: 'warning',
      message: "Usage of the null-forgiving operator '!.' bypasses compiler nullability checks. Ensure this is safe or use the null-conditional operator '?.' or explicit null checks."
    });
  }

  // 3. SOLID CHECKS
  // LSP Violation (NotImplementedException)
  if (/\bthrow\s+new\s+NotImplementedException\b/.test(clean)) {
    findings.push({
      file: filepath,
      line: lineNumber,
      category: 'SOLID',
      severity: 'warning',
      message: "Throwing NotImplementedException indicates that this class does not fully implement the behavior of its base type or interface, potentially violating the Liskov Substitution Principle (LSP)."
    });
  }

  // SRP Violation (Method/Constructor Parameter Count)
  const methodMatch = clean.match(/\b(public|private|protected|internal|static|override|virtual|async|void)\s+(?:[A-Za-z0-9_<>@\[\]]+\s+)*[A-Za-z0-9_<>@]+\s*\(([^)]*)\)/);
  if (methodMatch) {
    const paramList = methodMatch[2];
    const params = paramList.split(',').map(p => p.trim()).filter(Boolean);
    if (params.length >= 5) {
      const looksLikeDeclaration = params.every(p => p.split(/\s+/).length >= 2);
      if (looksLikeDeclaration) {
        findings.push({
          file: filepath,
          line: lineNumber,
          category: 'SOLID',
          severity: 'warning',
          message: `Method has ${params.length} parameters, which violates the Single Responsibility Principle (SRP). Consider refactoring the parameters into a parameter object or class.`
        });
      }
    }
  }

  return findings;
}

// Parse unified patch diff and run checks on added lines
function parsePatch(patch, filepath) {
  if (!patch) return [];
  const lines = patch.split('\n');
  const findings = [];
  let currentNewLine = 0;
  let currentOldLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        currentOldLine = parseInt(match[1], 10) - 1;
        currentNewLine = parseInt(match[2], 10) - 1;
      }
      continue;
    }

    if (line.startsWith('+')) {
      currentNewLine++;
      const code = line.slice(1);
      const cleaned = cleanCode(code);
      const lineFindings = analyzeLine(cleaned, filepath, currentNewLine);
      findings.push(...lineFindings);
    } else if (line.startsWith('-')) {
      currentOldLine++;
    } else if (line.startsWith(' ')) {
      currentNewLine++;
      currentOldLine++;
    }
  }

  return findings;
}

// Helper to make HTTPS requests to GitHub API
function githubRequest(method, urlPath, body = null, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: urlPath,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'PR-Sentry-Action',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`GitHub API request failed. Path: ${urlPath}, Status: ${res.statusCode}, Response: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Main execution function
async function run() {
  try {
    const token = process.env.INPUT_GITHUB_TOKEN || process.env['INPUT_GITHUB-TOKEN'] || process.env.GITHUB_TOKEN;
    if (!token) {
      console.error('Error: GITHUB_TOKEN is not provided. Please provide it in the action inputs or environment.');
      process.exit(1);
    }

    if (!process.env.GITHUB_EVENT_PATH) {
      console.error('Error: GITHUB_EVENT_PATH is not set. This action must run in a GitHub Actions workflow environment.');
      process.exit(1);
    }

    const eventPayload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (!eventPayload.pull_request) {
      console.log('Not a pull request event. Skipping PR Sentry review.');
      process.exit(0);
    }

    const prNumber = eventPayload.pull_request.number;
    const commitId = eventPayload.pull_request.head.sha;
    const repository = eventPayload.repository;
    const owner = repository.owner.login;
    const repo = repository.name;

    console.log(`Analyzing PR #${prNumber} in repository ${owner}/${repo} at commit ${commitId}`);

    // 1. Fetch files changed in PR
    console.log('Fetching changed files...');
    const files = await githubRequest('GET', `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, null, token);
    console.log(`Found ${files.length} file(s) in PR.`);

    // 2. Fetch existing review comments to avoid duplicates
    console.log('Fetching existing review comments...');
    let existingComments = [];
    try {
      existingComments = await githubRequest('GET', `/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`, null, token);
      console.log(`Found ${existingComments.length} existing comment(s).`);
    } catch (e) {
      console.warn('Warning: Could not fetch existing comments. Duplicate checking may be bypassed.', e.message);
    }

    // Set of existing comments: "file:line:category"
    const existingSet = new Set();
    for (const comment of existingComments) {
      if (comment.path && comment.line && comment.body) {
        const match = comment.body.match(/\*\*\[(null-handling|async|SOLID)\]\*\*/);
        if (match) {
          const category = match[1];
          existingSet.add(`${comment.path}:${comment.line}:${category}`);
        }
      }
    }

    // 3. Process each file and collect findings
    const findings = [];
    for (const file of files) {
      if (file.status === 'removed') {
        console.log(`Skipping deleted file: ${file.filename}`);
        continue;
      }

      if (!file.filename.endsWith('.cs')) {
        console.log(`Skipping non-C# file: ${file.filename}`);
        continue;
      }

      const lowerFilename = file.filename.toLowerCase();
      if (lowerFilename.includes('.g.cs') || lowerFilename.includes('.designer.cs') || lowerFilename.includes('.generated.cs')) {
        console.log(`Skipping generated C# file: ${file.filename}`);
        continue;
      }

      if (!file.patch) {
        console.log(`Skipping file with no patch (empty or binary): ${file.filename}`);
        continue;
      }

      console.log(`Reviewing: ${file.filename}`);
      const fileFindings = parsePatch(file.patch, file.filename);
      findings.push(...fileFindings);
    }

    console.log(`Total findings identified: ${findings.length}`);

    // 4. Filter out duplicates
    const newFindings = [];
    for (const finding of findings) {
      const key = `${finding.file}:${finding.line}:${finding.category}`;
      if (existingSet.has(key)) {
        console.log(`Skipping duplicate finding at ${finding.file}:${finding.line} under category [${finding.category}]`);
      } else {
        newFindings.push(finding);
      }
    }

    console.log(`New findings to post: ${newFindings.length}`);

    if (newFindings.length === 0) {
      console.log('No new findings to publish.');
      process.exit(0);
    }

    // 5. Build review comments payload
    const reviewComments = newFindings.map(finding => ({
      path: finding.file,
      line: finding.line,
      side: 'RIGHT',
      body: `**[${finding.category}]** ${finding.message}`
    }));

    // Group counts for summary
    const counts = { SOLID: 0, 'null-handling': 0, async: 0 };
    newFindings.forEach(f => {
      counts[f.category] = (counts[f.category] || 0) + 1;
    });

    const summaryText = `PR Sentry found ${newFindings.length} new items across C# changes (${counts['null-handling']} null-handling, ${counts['async']} async, ${counts['SOLID']} SOLID). See inline notes.`;

    const reviewPayload = {
      commit_id: commitId,
      event: 'COMMENT',
      body: summaryText,
      comments: reviewComments
    };

    // 6. Post review
    console.log('Publishing review comments to GitHub...');
    const result = await githubRequest('POST', `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, reviewPayload, token);
    console.log('PR Sentry Review successfully posted!', JSON.stringify(result));
  } catch (error) {
    console.error('Fatal Error running PR Sentry:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
} else {
  module.exports = {
    cleanCode,
    analyzeLine,
    parsePatch,
    githubRequest
  };
}

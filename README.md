# PR Sentry C# Reviewer Action

PR Sentry is a lightweight, high-performance GitHub Action that reviews C# Pull Requests for common code smells in three categories: **SOLID principles**, **Null-Safety**, and **Async Correctness**. It is built using Node.js 20 with zero dependencies, making it start instantly without container overhead.

PR Sentry only reviews **changed code hunks** (the diff) rather than full files. This keeps reviews highly relevant, avoids flagging pre-existing code that the author did not touch, and prevents double-posting comments on repeated runs.

## Features

- **Grounded inline review comments**: Comments land on the exact line and file where the issue was introduced.
- **Zero double-posting**: Re-runs on `synchronize` pushes only comment on *new* or *shifted* violations; already commented violations on a line are skipped.
- **Safe fork PR handling**: Detects read-only permissions on fork PRs gracefully and logs appropriate warnings.
- **Ignore list out-of-the-box**: Auto-generated files (`.g.cs`, `.designer.cs`, `.generated.cs`), binary files, and deleted files are skipped automatically.

---

## Quick Start: How to Add to Your Repo

Create a file named `.github/workflows/pr-sentry.yml` in your repository and paste the following content:

```yaml
name: PR Sentry

on:
  pull_request:
    types: [opened, synchronize]
    paths:
      - '**/*.cs'

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run PR Sentry C# Reviewer
        uses: svpoo/raale@main # Replace with your repo's organization/repo name and branch
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Inputs

| Input | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `github-token` | The GitHub API access token | Yes | `${{ github.token }}` |

---

## Code Smells Detected

### 1. SOLID Rules
- **Single Responsibility Principle (SRP)**: Detects methods and constructors with 5 or more parameters.
- **Liskov Substitution Principle (LSP)**: Detects explicit throws of `NotImplementedException`, indicating a type does not fully fulfill its contract.

### 2. Null-Safety Rules
- **Null-Forgiving Operator Overuse**: Detects usage of the `!.` operator (e.g. `user!.Name`), bypassing compiler nullability checks.
- **Swallowing NullReferenceException**: Detects catching `NullReferenceException` instead of properly handling or checking for null values.

### 3. Async Correctness Rules
- **Async Void**: Detects methods declared as `async void` instead of `async Task`, preventing unhandled exceptions from crashing the application.
- **Blocking Async Calls**: Detects blocking on async code using `.Result`, `.Wait()`, or `.GetResult()`, preventing deadlocks and thread pool starvation.
- **Unawaited Async Calls**: Detects methods ending in `Async` that are called without `await`, `return`, assignment, or handling.

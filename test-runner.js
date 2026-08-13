const reviewer = require('./index.js');

let testsRun = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    testsFailed++;
  }
}

console.log('--- Starting PR Sentry Local Verification Suite ---');

// 1. Test cleanCode
const codeWithComments = 'var x = customer!.Name; // comment here';
const clean = reviewer.cleanCode(codeWithComments);
assert(clean.trim() === 'var x = customer!.Name;', 'cleanCode should strip single line comments');

const codeWithStrings = 'var message = "Hello // comment in string";';
const cleanStrings = reviewer.cleanCode(codeWithStrings);
assert(cleanStrings.trim() === 'var message = "";', 'cleanCode should strip string literals');

// 2. Test analyzeLine - ASYNC
const findingsAsyncVoid = reviewer.analyzeLine('async void HandleEvent(object sender)', 'Test.cs', 10);
assert(findingsAsyncVoid.length === 1 && findingsAsyncVoid[0].category === 'async', 'async void should be flagged');

const findingsResult = reviewer.analyzeLine('var data = task.Result;', 'Test.cs', 12);
assert(findingsResult.length === 1 && findingsResult[0].category === 'async' && findingsResult[0].message.includes('Result'), 'task.Result should be flagged');

const findingsWait = reviewer.analyzeLine('task.Wait();', 'Test.cs', 13);
assert(findingsWait.length === 1 && findingsWait[0].category === 'async' && findingsWait[0].message.includes('Wait'), 'task.Wait() should be flagged');

const findingsGetResult = reviewer.analyzeLine('task.GetAwaiter().GetResult();', 'Test.cs', 14);
assert(findingsGetResult.length === 1 && findingsGetResult[0].category === 'async' && findingsGetResult[0].message.includes('GetResult'), 'GetResult() should be flagged');

const findingsUnawaited = reviewer.analyzeLine('DoSomethingAsync();', 'Test.cs', 15);
assert(findingsUnawaited.length === 1 && findingsUnawaited[0].category === 'async' && findingsUnawaited[0].message.includes('DoSomethingAsync'), 'unawaited async call should be flagged');

const findingsAwaited = reviewer.analyzeLine('await DoSomethingAsync();', 'Test.cs', 16);
assert(findingsAwaited.length === 0, 'awaited async call should NOT be flagged');

const findingsAssigned = reviewer.analyzeLine('var t = DoSomethingAsync();', 'Test.cs', 17);
assert(findingsAssigned.length === 0, 'async call assigned to variable should NOT be flagged');

const findingsMethodDecl = reviewer.analyzeLine('public async Task MyMethodAsync()', 'Test.cs', 18);
assert(findingsMethodDecl.length === 0, 'async method declaration should NOT be flagged as unawaited call');

// 3. Test analyzeLine - NULL-HANDLING
const findingsCatchNRE = reviewer.analyzeLine('catch (NullReferenceException ex)', 'Test.cs', 20);
assert(findingsCatchNRE.length === 1 && findingsCatchNRE[0].category === 'null-handling', 'catching NullReferenceException should be flagged');

const findingsNullForgiving = reviewer.analyzeLine('var length = user!.Name.Length;', 'Test.cs', 21);
assert(findingsNullForgiving.length === 1 && findingsNullForgiving[0].category === 'null-handling', 'null-forgiving operator user!.Name should be flagged');

const findingsLogicalNot = reviewer.analyzeLine('if (!user.IsActive)', 'Test.cs', 22);
assert(findingsLogicalNot.length === 0, 'logical NOT should NOT be flagged as null-forgiving');

// 4. Test analyzeLine - SOLID
const findingsNotImplemented = reviewer.analyzeLine('throw new NotImplementedException();', 'Test.cs', 30);
assert(findingsNotImplemented.length === 1 && findingsNotImplemented[0].category === 'SOLID', 'throw NotImplementedException should be flagged');

const findingsSRPFewParams = reviewer.analyzeLine('public void Process(int a, int b)', 'Test.cs', 31);
assert(findingsSRPFewParams.length === 0, 'method with few parameters should NOT be flagged');

const findingsSRPMethod = reviewer.analyzeLine('public void RegisterUser(string name, string email, string password, string phone, string address)', 'Test.cs', 32);
assert(findingsSRPMethod.length === 1 && findingsSRPMethod[0].category === 'SOLID' && findingsSRPMethod[0].message.includes('violates the Single Responsibility Principle'), 'method with 5 parameters should be flagged');

const findingsSRPConstructor = reviewer.analyzeLine('public UserService(IDb db, ILogger log, IMail mail, ICache cache, IAuth auth)', 'Test.cs', 33);
assert(findingsSRPConstructor.length === 1 && findingsSRPConstructor[0].category === 'SOLID' && findingsSRPConstructor[0].message.includes('violates the Single Responsibility Principle'), 'constructor with 5 parameters should be flagged');

const findingsSRPCall = reviewer.analyzeLine('RegisterUser(name, email, password, phone, address);', 'Test.cs', 34);
assert(findingsSRPCall.length === 0, 'method CALL with 5 arguments should NOT be flagged');

// 5. Test parsePatch / Line Mapping
const patch = `@@ -10,4 +10,6 @@
 unchanged line 10
-removed line 11
+added line 11 (async void Smell)
+added line 12 (blocking task.Result)
 unchanged line 13
+added line 14 (throw new NotImplementedException())`;

const findingsFromPatch = reviewer.parsePatch(patch, 'BillingService.cs');
assert(findingsFromPatch.length === 3, 'should find exactly 3 issues in the patch');
assert(findingsFromPatch[0].line === 11 && findingsFromPatch[0].category === 'async', 'first smell should be at line 11');
assert(findingsFromPatch[1].line === 12 && findingsFromPatch[1].category === 'async', 'second smell should be at line 12');
assert(findingsFromPatch[2].line === 14 && findingsFromPatch[2].category === 'SOLID', 'third smell should be at line 14');

console.log(`\nTests Run: ${testsRun}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed successfully! The static analyzer and line mapping are 100% correct.');
  process.exit(0);
}

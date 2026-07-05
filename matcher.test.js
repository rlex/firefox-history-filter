"use strict";

const assert = require("node:assert/strict");
const { HistoryFilterMatcher } = require("./matcher.js");

const rules = HistoryFilterMatcher.parseRules(`
# ignored
example.com
*.private.test
**.deep.test
@family.test
https://news.example/path
*://*.wild.test/*secret*
port.test:8080
@family-port.test:8080
[2001:db8::1]
[2001:db8::2]:8080
default-http.test:80
default-https.test:443
regex:^https://regex\\.test/(private|tmp)/
`);

assert.equal(HistoryFilterMatcher.urlMatchesRules("https://example.com/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://EXAMPLE.com/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://www.example.com/a", rules), false);

assert.equal(HistoryFilterMatcher.urlMatchesRules("https://private.test/a", rules), false);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://a.private.test/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://a.b.private.test/a", rules), false);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://notprivate.test/a", rules), false);

assert.equal(HistoryFilterMatcher.urlMatchesRules("https://deep.test/a", rules), false);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://a.deep.test/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://a.b.deep.test/a", rules), true);

assert.equal(HistoryFilterMatcher.urlMatchesRules("https://family.test/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://a.family.test/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://a.b.family.test/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://notfamily.test/a", rules), false);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://family.test.evil/a", rules), false);

assert.equal(HistoryFilterMatcher.urlMatchesRules("https://news.example/path/story", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://news.example/PATH/story", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://news.example/other", rules), false);

assert.equal(HistoryFilterMatcher.urlMatchesRules("https://a.wild.test/path/secret-value", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://A.WILD.test/path/SECRET-value", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("http://a.wild.test/path/public", rules), false);

assert.equal(HistoryFilterMatcher.urlMatchesRules("https://regex.test/private/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://regex.test/tmp/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://regex.test/public/a", rules), false);

assert.equal(HistoryFilterMatcher.urlMatchesRules("https://port.test:8080/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://port.test/a", rules), false);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://family-port.test:8080/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://a.family-port.test:8080/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://a.family-port.test/a", rules), false);
assert.equal(HistoryFilterMatcher.urlMatchesRules("http://[2001:db8::1]/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("http://[2001:db8::2]:8080/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("http://[2001:db8::2]/a", rules), false);
assert.equal(HistoryFilterMatcher.urlMatchesRules("http://default-http.test/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://default-http.test/a", rules), false);
assert.equal(HistoryFilterMatcher.urlMatchesRules("https://default-https.test/a", rules), true);
assert.equal(HistoryFilterMatcher.urlMatchesRules("http://default-https.test/a", rules), false);

assert.equal(HistoryFilterMatcher.urlMatchesRules("about:config", rules), false);

const ruleEntries = HistoryFilterMatcher.parseRuleEntries("# ignored\nexample.com\nregex:^https://entry\\.test/");
assert.deepEqual(ruleEntries, [
  { lineNumber: 2, rule: "example.com" },
  { lineNumber: 3, rule: "regex:^https://entry\\.test/" }
]);
assert.deepEqual(HistoryFilterMatcher.findMatchingRuleEntry("https://entry.test/a", ruleEntries), ruleEntries[1]);
assert.deepEqual(HistoryFilterMatcher.findMatchingRule("https://example.com/a", "# ignored\nexample.com"), {
  lineNumber: 2,
  rule: "example.com"
});
assert.equal(HistoryFilterMatcher.findMatchingRule("https://none.test/a", "example.com"), null);

assert.deepEqual(HistoryFilterMatcher.validateRules("example.com\n*.example.com\n**.example.com\n@example.com\n[2001:db8::1]").errors, []);
assert.equal(HistoryFilterMatcher.validateRules("example.com\nEXAMPLE.com").warnings.length, 1);

assert.deepEqual(HistoryFilterMatcher.findRedundantRules("@example.com\nexample.com\n*.example.com\n**.example.com"), [
  {
    lineNumber: 2,
    rule: "example.com",
    coveredByLineNumber: 1,
    coveredByRule: "@example.com"
  },
  {
    lineNumber: 3,
    rule: "*.example.com",
    coveredByLineNumber: 1,
    coveredByRule: "@example.com"
  },
  {
    lineNumber: 4,
    rule: "**.example.com",
    coveredByLineNumber: 1,
    coveredByRule: "@example.com"
  }
]);
assert.deepEqual(HistoryFilterMatcher.findRedundantRules("**.example.com\n*.a.example.com\n@a.example.com"), [
  {
    lineNumber: 2,
    rule: "*.a.example.com",
    coveredByLineNumber: 1,
    coveredByRule: "**.example.com"
  },
  {
    lineNumber: 3,
    rule: "@a.example.com",
    coveredByLineNumber: 1,
    coveredByRule: "**.example.com"
  }
]);
assert.deepEqual(HistoryFilterMatcher.findRedundantRules("example.com\n@example.com:443\nexample.com:443"), [
  {
    lineNumber: 3,
    rule: "example.com:443",
    coveredByLineNumber: 1,
    coveredByRule: "example.com"
  }
]);
assert.deepEqual(HistoryFilterMatcher.findRedundantRules("*.example.com\n**.example.com"), [
  {
    lineNumber: 1,
    rule: "*.example.com",
    coveredByLineNumber: 2,
    coveredByRule: "**.example.com"
  }
]);
assert.deepEqual(HistoryFilterMatcher.findRedundantRules("[2001:db8::1]\n[2001:db8::1]:443"), [
  {
    lineNumber: 2,
    rule: "[2001:db8::1]:443",
    coveredByLineNumber: 1,
    coveredByRule: "[2001:db8::1]"
  }
]);

assert.equal(HistoryFilterMatcher.validateRules("example .com").errors[0].message, "Rules cannot contain spaces.");
assert.equal(
  HistoryFilterMatcher.validateRules("ftp://example.com/path").errors[0].message,
  "Use http://, https://, or *:// for URL rules."
);
assert.equal(
  HistoryFilterMatcher.validateRules("example.com/path").errors[0].message,
  "Path rules need http://, https://, or *:// at the start."
);
assert.deepEqual(HistoryFilterMatcher.validateRules("example.com:8080").errors, []);
assert.equal(
  HistoryFilterMatcher.validateRules("example.com:0").errors[0].message,
  "Ports must be numbers from 1 to 65535."
);
assert.equal(
  HistoryFilterMatcher.validateRules("example.com:65536").errors[0].message,
  "Ports must be numbers from 1 to 65535."
);
assert.deepEqual(HistoryFilterMatcher.validateRules("regex:^https://example\\.com/(private|tmp)/").errors, []);
assert.equal(
  HistoryFilterMatcher.validateRules("regex:(").errors[0].message,
  "Invalid regex: Invalid regular expression: /(/i: Unterminated group"
);
assert.equal(
  HistoryFilterMatcher.validateRules("regex:").errors[0].message,
  "Regex rules need a pattern after regex:."
);
assert.equal(
  HistoryFilterMatcher.validateRules("**.").errors[0].message,
  "This host wildcard is too broad."
);
assert.equal(
  HistoryFilterMatcher.validateRules("@").errors[0].message,
  "Catchall host rules need a domain after @."
);
assert.equal(
  HistoryFilterMatcher.validateRules("@*.example.com").errors[0].message,
  "Catchall host rules cannot contain wildcards."
);
assert.equal(
  HistoryFilterMatcher.validateRules("[example.com]").errors[0].message,
  "Bracketed host rules are only for IPv6 addresses. Use @example.com for catchall domains."
);
assert.equal(
  HistoryFilterMatcher.validateRules("[2001:db8::1]:abc").errors[0].message,
  "IPv6 host rules can only include an optional numeric port after ]."
);

console.log("matcher tests passed");

(function (globalScope) {
  "use strict";

  function escapeRegex(value) {
    return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }

  function wildcardToRegex(value) {
    return new RegExp("^" + escapeRegex(value).replace(/\*/g, ".*") + "$", "i");
  }

  function isRegexRule(rule) {
    return rule.toLowerCase().startsWith("regex:");
  }

  function getRuleKind(rule) {
    if (isRegexRule(rule)) {
      return "regex";
    }

    if (rule.includes("://") || rule.includes("/")) {
      return "url";
    }

    return "host";
  }

  function parseRegexRule(rule) {
    return new RegExp(rule.slice("regex:".length), "i");
  }

  function normalizeRule(rule) {
    return rule.trim();
  }

  function parseRules(input) {
    return input
      .split(/\r?\n/)
      .map(normalizeRule)
      .filter((rule) => rule && !rule.startsWith("#"));
  }

  function parseRuleEntries(input) {
    const entries = [];

    input.split(/\r?\n/).forEach((line, index) => {
      const rule = normalizeRule(line);
      if (rule && !rule.startsWith("#")) {
        entries.push({ lineNumber: index + 1, rule });
      }
    });

    return entries;
  }

  function hasInternalWhitespace(rule) {
    return /\s/.test(rule);
  }

  function addValidationIssue(issues, lineNumber, rule, message) {
    issues.push({ lineNumber, rule, message });
  }

  function splitHostRule(rule) {
    if (rule.startsWith("[")) {
      const closingBracketIndex = rule.indexOf("]");
      if (closingBracketIndex === -1) {
        return { hostRule: rule, port: "" };
      }

      const hostRule = rule.slice(0, closingBracketIndex + 1);
      const rest = rule.slice(closingBracketIndex + 1);
      const portMatch = rest.match(/^:(\d+)$/);
      return {
        hostRule,
        port: portMatch ? portMatch[1] : ""
      };
    }

    const portMatch = rule.match(/:(\d+)$/);
    if (!portMatch) {
      return { hostRule: rule, port: "" };
    }

    return {
      hostRule: rule.slice(0, -portMatch[0].length),
      port: portMatch[1]
    };
  }

  function isHostFamilyRule(hostRule) {
    return hostRule.startsWith("@");
  }

  function unwrapHostFamilyRule(hostRule) {
    return hostRule.slice(1);
  }

  function isBracketedIpv6Rule(hostRule) {
    return hostRule.startsWith("[") && hostRule.endsWith("]") && hostRule.includes(":");
  }

  function hostRuleDetails(rule) {
    if (getRuleKind(rule) !== "host") {
      return null;
    }

    const { hostRule, port } = splitHostRule(rule);
    const normalizedRule = hostRule.toLowerCase();

    if (isHostFamilyRule(normalizedRule)) {
      return { kind: "family", domain: unwrapHostFamilyRule(normalizedRule), port };
    }

    if (normalizedRule.startsWith("**.")) {
      return { kind: "deep", domain: normalizedRule.slice(3), port };
    }

    if (normalizedRule.startsWith("*.")) {
      return { kind: "one-level", domain: normalizedRule.slice(2), port };
    }

    if (normalizedRule.includes("*")) {
      return null;
    }

    return { kind: "exact", domain: normalizedRule, port };
  }

  function subdomainDepth(host, suffix) {
    if (!host.endsWith("." + suffix)) {
      return -1;
    }

    return host.slice(0, -suffix.length - 1).split(".").length;
  }

  function portsCover(coveringPort, coveredPort) {
    return !coveringPort || coveringPort === coveredPort;
  }

  function hostDetailsCover(covering, covered) {
    if (!portsCover(covering.port, covered.port)) {
      return false;
    }

    const exactMatch = covered.domain === covering.domain;
    const depth = subdomainDepth(covered.domain, covering.domain);
    const isSubdomain = depth > 0;

    switch (covered.kind) {
      case "exact":
        if (covering.kind === "exact") {
          return exactMatch;
        }
        if (covering.kind === "one-level") {
          return depth === 1;
        }
        if (covering.kind === "deep") {
          return isSubdomain;
        }
        if (covering.kind === "family") {
          return exactMatch || isSubdomain;
        }
        return false;
      case "one-level":
        if (covering.kind === "one-level") {
          return exactMatch;
        }
        if (covering.kind === "deep" || covering.kind === "family") {
          return exactMatch || isSubdomain;
        }
        return false;
      case "deep":
        return (covering.kind === "deep" || covering.kind === "family") && (exactMatch || isSubdomain);
      case "family":
        if (covering.kind === "family") {
          return exactMatch || isSubdomain;
        }
        if (covering.kind === "deep") {
          return isSubdomain;
        }
        return false;
      default:
        return false;
    }
  }

  function validatePort(port, lineNumber, rule, errors) {
    if (!port) {
      return true;
    }

    const portNumber = Number(port);
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      addValidationIssue(errors, lineNumber, rule, "Ports must be numbers from 1 to 65535.");
      return false;
    }

    return true;
  }

  function getEffectivePort(parsedUrl) {
    if (parsedUrl.port) {
      return parsedUrl.port;
    }

    if (parsedUrl.protocol === "http:") {
      return "80";
    }

    if (parsedUrl.protocol === "https:") {
      return "443";
    }

    return "";
  }

  function validateUrlRule(rule, lineNumber, errors) {
    if (rule.includes("://")) {
      const protocol = rule.slice(0, rule.indexOf("://")).toLowerCase();
      if (protocol !== "http" && protocol !== "https" && protocol !== "*") {
        addValidationIssue(errors, lineNumber, rule, "Use http://, https://, or *:// for URL rules.");
        return;
      }

      const afterProtocol = rule.slice(rule.indexOf("://") + 3);
      const hostPattern = afterProtocol.split("/")[0];
      if (!hostPattern) {
        addValidationIssue(errors, lineNumber, rule, "URL rules need a hostname.");
        return;
      }

      if (!rule.includes("*")) {
        try {
          new URL(rule);
        } catch (_error) {
          addValidationIssue(errors, lineNumber, rule, "This URL rule is not a valid URL prefix.");
        }
      }
      return;
    }

    addValidationIssue(errors, lineNumber, rule, "Path rules need http://, https://, or *:// at the start.");
  }

  function validateHostRule(rule, lineNumber, errors) {
    const { hostRule, port } = splitHostRule(rule);

    if (hostRule.includes(":") && !isBracketedIpv6Rule(hostRule)) {
      addValidationIssue(errors, lineNumber, rule, "Host rules cannot include protocols.");
      return;
    }

    if (rule.startsWith("[") && hostRule.length !== rule.length && !rule.slice(hostRule.length).match(/^:\d+$/)) {
      addValidationIssue(errors, lineNumber, rule, "IPv6 host rules can only include an optional numeric port after ].");
      return;
    }

    if (hostRule.startsWith("[") && !isBracketedIpv6Rule(hostRule)) {
      addValidationIssue(errors, lineNumber, rule, "Bracketed host rules are only for IPv6 addresses. Use @example.com for catchall domains.");
      return;
    }

    if (isHostFamilyRule(hostRule)) {
      const familyHost = unwrapHostFamilyRule(hostRule);
      if (!familyHost) {
        addValidationIssue(errors, lineNumber, rule, "Catchall host rules need a domain after @.");
        return;
      }

      if (familyHost.includes("*")) {
        addValidationIssue(errors, lineNumber, rule, "Catchall host rules cannot contain wildcards.");
        return;
      }
    }

    if (!validatePort(port, lineNumber, rule, errors)) {
      return;
    }

    if (hostRule === "*" || hostRule === "*." || hostRule === "**.") {
      addValidationIssue(errors, lineNumber, rule, "This host wildcard is too broad.");
      return;
    }

    if (hostRule === "@" || hostRule === "@." || hostRule === "@**.") {
      addValidationIssue(errors, lineNumber, rule, "Catchall host rules need a domain after @.");
      return;
    }

    if (hostRule.startsWith("*.") && hostRule.length === 2) {
      addValidationIssue(errors, lineNumber, rule, "Wildcard host rules need a domain after *.");
    }

    if (hostRule.startsWith("**.") && hostRule.length === 3) {
      addValidationIssue(errors, lineNumber, rule, "Deep wildcard host rules need a domain after **.");
    }
  }

  function validateRegexRule(rule, lineNumber, errors) {
    const pattern = rule.slice("regex:".length);
    if (!pattern) {
      addValidationIssue(errors, lineNumber, rule, "Regex rules need a pattern after regex:.");
      return;
    }

    try {
      parseRegexRule(rule);
    } catch (error) {
      addValidationIssue(errors, lineNumber, rule, `Invalid regex: ${error.message}`);
    }
  }

  function validateRules(input) {
    const errors = [];
    const warnings = [];
    const seenRules = new Map();

    input.split(/\r?\n/).forEach((line, index) => {
      const lineNumber = index + 1;
      const rule = normalizeRule(line);

      if (!rule || rule.startsWith("#")) {
        return;
      }

      const duplicateKey = rule.toLowerCase();
      if (seenRules.has(duplicateKey)) {
        addValidationIssue(warnings, lineNumber, rule, `Duplicate of line ${seenRules.get(duplicateKey)}.`);
      } else {
        seenRules.set(duplicateKey, lineNumber);
      }

      if (hasInternalWhitespace(rule)) {
        addValidationIssue(errors, lineNumber, rule, "Rules cannot contain spaces.");
        return;
      }

      switch (getRuleKind(rule)) {
        case "regex":
          validateRegexRule(rule, lineNumber, errors);
          break;
        case "url":
          validateUrlRule(rule, lineNumber, errors);
          break;
        case "host":
          validateHostRule(rule, lineNumber, errors);
          break;
      }
    });

    return { errors, warnings };
  }

  function findRedundantRules(input) {
    const entries = parseRuleEntries(input)
      .map((entry) => ({ ...entry, details: hostRuleDetails(entry.rule) }))
      .filter((entry) => entry.details);
    const redundantRules = [];

    for (const entry of entries) {
      const coveringEntry = entries.find((candidate) => {
        if (candidate.lineNumber === entry.lineNumber && candidate.rule === entry.rule) {
          return false;
        }

        if (candidate.rule.toLowerCase() === entry.rule.toLowerCase()) {
          return false;
        }

        return hostDetailsCover(candidate.details, entry.details);
      });

      if (coveringEntry) {
        redundantRules.push({
          lineNumber: entry.lineNumber,
          rule: entry.rule,
          coveredByLineNumber: coveringEntry.lineNumber,
          coveredByRule: coveringEntry.rule
        });
      }
    }

    return redundantRules;
  }

  function hostMatches(rule, host, port) {
    const { hostRule, port: rulePort } = splitHostRule(rule);
    if (rulePort && rulePort !== port) {
      return false;
    }

    const normalizedHost = host.toLowerCase();
    const normalizedRule = hostRule.toLowerCase();

    if (isHostFamilyRule(normalizedRule)) {
      const suffix = unwrapHostFamilyRule(normalizedRule);
      return normalizedHost === suffix || normalizedHost.endsWith("." + suffix);
    }

    if (normalizedRule.startsWith("**.")) {
      const suffix = normalizedRule.slice(3);
      return normalizedHost.endsWith("." + suffix);
    }

    if (normalizedRule.startsWith("*.")) {
      const suffix = normalizedRule.slice(2);
      const prefix = normalizedHost.slice(0, -suffix.length - 1);
      return normalizedHost.endsWith("." + suffix) && prefix !== "" && !prefix.includes(".");
    }

    if (normalizedRule.includes("*")) {
      return wildcardToRegex(normalizedRule).test(normalizedHost);
    }

    return normalizedHost === normalizedRule;
  }

  function urlPrefixMatches(rule, url) {
    if (rule.includes("*")) {
      return wildcardToRegex(rule).test(url);
    }

    return url.toLowerCase().startsWith(rule.toLowerCase());
  }

  function ruleMatchesUrl(rule, url) {
    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch (_error) {
      return false;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return false;
    }

    switch (getRuleKind(rule)) {
      case "regex":
        try {
          return parseRegexRule(rule).test(url);
        } catch (_error) {
          return false;
        }
      case "url":
        return urlPrefixMatches(rule, url);
      case "host":
        return hostMatches(rule, parsedUrl.hostname, getEffectivePort(parsedUrl));
      default:
        return false;
    }
  }

  function urlMatchesRules(url, rules) {
    return rules.some((rule) => ruleMatchesUrl(rule, url));
  }

  function findMatchingRuleEntry(url, entries) {
    return entries.find((entry) => ruleMatchesUrl(entry.rule, url)) || null;
  }

  function findMatchingRule(url, input) {
    return findMatchingRuleEntry(url, parseRuleEntries(input));
  }

  globalScope.HistoryFilterMatcher = {
    parseRules,
    parseRuleEntries,
    ruleMatchesUrl,
    urlMatchesRules,
    findMatchingRuleEntry,
    findMatchingRule,
    findRedundantRules,
    validateRules
  };
})(this);

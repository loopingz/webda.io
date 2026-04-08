import { expect, test, vi } from "vitest";
import { CloudEvent } from "cloudevents";
import { ANTLRInputStream, CommonTokenStream } from "antlr4ts";
import { ParseTreeWalker } from "antlr4ts/tree";
import { FiltersHelper } from ".";
import { SqlFilterImplementation, LikeExpression, AttributeExpression, InExpression, ValueExpression } from "./sql";
import { CESQLParserLexer } from "./sql/CESQLParserLexer";
import {
  CESQLParserParser,
  CesqlContext,
  BinaryMultiplicativeExpressionContext,
  BinaryAdditiveExpressionContext,
  BinaryComparisonExpressionContext,
  BinaryLogicExpressionContext,
  LikeExpressionContext,
  InExpressionContext,
  ExistsExpressionContext,
  UnaryLogicExpressionContext,
  UnaryNumericExpressionContext,
  SubExpressionContext,
  AtomExpressionContext,
  FunctionInvocationExpressionContext,
  ExpressionContext,
  AtomContext,
  BooleanAtomContext,
  IntegerAtomContext,
  StringAtomContext,
  IdentifierAtomContext,
  IdentifierContext,
  FunctionIdentifierContext,
  BooleanLiteralContext,
  StringLiteralContext,
  IntegerLiteralContext,
  FunctionParameterListContext,
  SetExpressionContext
} from "./sql/CESQLParserParser";
import type { CESQLParserListener } from "./sql/CESQLParserListener";

const event: CloudEvent<any> = new CloudEvent({ type: "com.test", source: "unit-test", data: {} });
const event2: CloudEvent<any> = new CloudEvent({
  type: "com.test",
  subject: "plop",
  source: "unit-test",
  custom1: " Plop ",
  data: {}
});

test("SQLFilter", () => {
  expect(
    FiltersHelper.get({
      sql: "EXISTS subject"
    }).match(event)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: "EXISTS subject"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject = "plop"`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject = "plopi"`
    }).match(event2)
  ).toBe(false);
});

test("SQLFilter Sets", () => {
  expect(
    FiltersHelper.get({
      sql: `subject IN ("plopi", "plop")`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject NOT IN ("plopi", "plop")`
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: `NOT subject IN ("plopi", "plop")`
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: `NOT subject NOT IN ("plopi", "plop")`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject IN ("plopi", "plopa")`
    }).match(event2)
  ).toBe(false);
});

test("SQLFilter Arithmetic", () => {
  expect(
    FiltersHelper.get({
      sql: "1 + 2 > 1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 + 2 > 3"
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: "1 + 2 < 1"
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: "1 / 2 < 1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "(1 - 1) * 2 < 1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 * 2 >= -1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 - 2 = -1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 - 2 <= -1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 - 3 <= -1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 - 1 <= -1"
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: "10 % 3 = 1"
    }).match(event2)
  ).toBe(true);
});

test("SQLFilter Logic Expression", () => {
  expect(
    FiltersHelper.get({
      sql: `subject = "plop" AND FALSE`
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: `TRUE XOR TRUE`
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: `subject = "plop" XOR FALSE`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject != "plop" XOR TRUE`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject != "plop" OR TRUE`
    }).match(event2)
  ).toBe(true);
});

test("SQLFilter functions", () => {
  expect(
    FiltersHelper.get({
      sql: `UPPER(subject) = 'PLOP'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `LENGTH(subject) = 4`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `UPPER(LEFT(subject, 2)) = 'PL'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `UPPER(RIGHT(subject, 2)) = 'OP'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `ABS(-1) = 1`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `LOWER(custom1) = ' plop '`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `LOWER(custom1) = ''`
    }).match(event)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `SUBSTRING(custom1, 1) = 'Plop '`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `SUBSTRING(TRIM(custom1), 0, 2) = 'Pl'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `CONCAT("Hello", "World") = 'HelloWorld'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `CONCAT_WS(" ", "Hello", "World") = 'Hello World'`
    }).match(event2)
  ).toBe(true);
});

test("SQLFilter converters", () => {
  expect(
    FiltersHelper.get({
      sql: `BOOL('true')`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `TRUE`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `BOOL('True')`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `BOOL('true2')`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `IS_BOOL(BOOL(TRUE))`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `BOOL(TRUE)`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `BOOL(12)`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `IS_INT(12)`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `IS_INT('plop')`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `STRING('plop') = 'plop'`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `STRING(122) = '122'`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `STRING(TRUE) = 'TRUE'`
    }).match(event2)
  ).toBe(true);
  // INT now
  expect(
    FiltersHelper.get({
      sql: `INT('plop') = 0`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `INT('122') = 122`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `INT(122) = 122`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `INT(TRUE) = 0`
    }).match(event2)
  ).toBe(true);
});

test("SQLFilter Like", () => {
  expect(
    FiltersHelper.get({
      sql: `subject LIKE "p%p"`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `subject LIKE "pl_p"`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `subject LIKE "p_p"`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `"te{plop}st" LIKE "te{plop}_t"`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject NOT LIKE "p%p"`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `subject NOT LIKE "pl_p"`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `subject NOT LIKE "p_p"`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `"te{plop}st" NOT LIKE "te{plop}_t"`
    }).match(event2)
  ).toBe(false);
});

test("SQLFilter errors", () => {
  expect(() =>
    FiltersHelper.get({
      sql: `PLOP(-1) = 1`
    }).match(event)
  ).toThrow(/Unknown function: 'PLOP'/);

  // One argument methods
  ["TRIM", "LENGTH", "UPPER", "ABS", "LOWER", "BOOL", "INT", "STRING", "IS_INT", "IS_BOOL"].forEach(method => {
    expect(() =>
      FiltersHelper.get({
        sql: `${method}("plop", "test")`
      }).match(event)
    ).toThrow(/Too many arguments/);
  });
  // Two arguments methods
  ["LEFT", "RIGHT"].forEach(method => {
    expect(() =>
      FiltersHelper.get({
        sql: `${method}("plop", "test", 3)`
      }).match(event)
    ).toThrow(/Wrong arguments count/);
  });

  expect(() =>
    FiltersHelper.get({
      sql: `SUBSTRING("plop", 0, 3, 4)`
    }).match(event)
  ).toThrow(/Wrong arguments count/);

  expect(() =>
    FiltersHelper.get({
      sql: `SUBSTRING("plop")`
    }).match(event)
  ).toThrow(/Wrong arguments count/);
});

test("SQLFilter optimization", async () => {
  expect(FiltersHelper.get({ sql: "RIGHT(topic, 4) = 'plop'" }).definition).toStrictEqual({
    suffix: {
      topic: "plop"
    }
  });
  expect(FiltersHelper.get({ sql: "LEFT(subject, 10) = 'cloudevent'" }).definition).toStrictEqual({
    prefix: {
      subject: "cloudevent"
    }
  });
});

test("SQLFilter COV", () => {
  let error;
  try {
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    // SQL should be optimized and compute when it can be
    expect(new SqlFilterImplementation({ sql: '"TEST" = TRUE OR 1 > 3' }).query.toString()).toBe("FALSE");
    expect(new SqlFilterImplementation({ sql: "1 <= 3" }).query.toString()).toBe("TRUE");
    expect(new SqlFilterImplementation({ sql: 'subject = "TEST" OR topic > 3 OR sub = TRUE' }).query.toString()).toBe(
      'subject = "TEST" OR topic > 3 OR sub = TRUE'
    );
    expect(new SqlFilterImplementation({ sql: "subject + 3 = 4 OR topic * 3 > 3" }).query.toString()).toBe(
      "subject + 3 = 4 OR topic * 3 > 3"
    );
    expect(new SqlFilterImplementation({ sql: 'subject NOT IN ["TEST", "TEST2"]' }).query.toString()).toBe(
      'subject NOT IN ("TEST","TEST2")'
    );
    expect(new SqlFilterImplementation({ sql: 'subject IN [topic, "TEST2"]' }).query.toString()).toBe(
      'subject IN (topic,"TEST2")'
    );
    expect(new SqlFilterImplementation({ sql: 'UPPER(subject) LIKE "W?BDA"' }).query.toString()).toBe(
      'UPPER(subject) LIKE "W?BDA"'
    );

    expect(new SqlFilterImplementation({ sql: 'NOT (UPPER(subject) LIKE "W?BDA")' }).query.toString()).toBe(
      'NOT UPPER(subject) LIKE "W?BDA"'
    );
    expect(new SqlFilterImplementation({ sql: "EXISTS plop" }).query.toString()).toBe("EXISTS plop");
    expect(new SqlFilterImplementation({ sql: "-subject" }).query.toString()).toBe("-subject");
    expect(new SqlFilterImplementation({ sql: 'UPPER(custom1) = ""' }).query.eval({})).toBe(true);
    expect(new SqlFilterImplementation({ sql: 'LOWER(custom1) = ""' }).query.eval({})).toBe(true);
    expect(new SqlFilterImplementation({ sql: "LENGTH(custom1) = 0" }).query.eval({})).toBe(true);
    expect(new SqlFilterImplementation({ sql: 'TRIM(custom1) = ""' }).query.eval({})).toBe(true);
    expect(new SqlFilterImplementation({ sql: 'SUBSTRING(custom1, 1,2) = ""' }).query.eval({})).toBe(true);
    expect(new SqlFilterImplementation({ sql: 'LEFT(custom1, 2) = ""' }).query.eval({})).toBe(true);
    expect(new SqlFilterImplementation({ sql: 'RIGHT(custom1, 2) = ""' }).query.eval({})).toBe(true);
    expect(new LikeExpression(new AttributeExpression("test"), '"test"', true).toString()).toBe('test NOT LIKE "test"');
    expect(new InExpression(new AttributeExpression("test"), [new ValueExpression("test")]).toString()).toBe(
      'test IN ("test")'
    );
    expect(new InExpression(new AttributeExpression("test"), [new AttributeExpression("test2")]).eval({}));
  } finally {
    error.mockRestore();
  }
});

test("ANTLR Parser introspection getters", () => {
  const lexer = new CESQLParserLexer(new ANTLRInputStream("TRUE"));
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new CESQLParserParser(tokenStream);

  // Exercise parser getter methods
  expect(parser.grammarFileName).toBe("CESQLParser.g4");
  expect(parser.ruleNames).toEqual(CESQLParserParser.ruleNames);
  expect(parser.serializedATN).toBe(CESQLParserParser._serializedATN);
  expect(parser.vocabulary).toBe(CESQLParserParser.VOCABULARY);

  // Exercise lexer getter methods
  expect(lexer.grammarFileName).toBe("CESQLParser.g4");
  expect(lexer.ruleNames).toEqual(CESQLParserLexer.ruleNames);
  expect(lexer.serializedATN).toBe(CESQLParserLexer._serializedATN);
  expect(lexer.vocabulary).toBe(CESQLParserLexer.VOCABULARY);
  expect(lexer.channelNames).toEqual(CESQLParserLexer.channelNames);
  expect(lexer.modeNames).toEqual(CESQLParserLexer.modeNames);
});

test("ANTLR ParseTreeWalker with listener exercises enterRule/exitRule", () => {
  // This test uses the listener pattern to exercise enterRule/exitRule on all context classes
  const visited: string[] = [];

  const listener: CESQLParserListener = {
    enterCesql: () => visited.push("enterCesql"),
    exitCesql: () => visited.push("exitCesql"),
    enterFunctionInvocationExpression: () => visited.push("enterFunctionInvocationExpression"),
    exitFunctionInvocationExpression: () => visited.push("exitFunctionInvocationExpression"),
    enterUnaryLogicExpression: () => visited.push("enterUnaryLogicExpression"),
    exitUnaryLogicExpression: () => visited.push("exitUnaryLogicExpression"),
    enterUnaryNumericExpression: () => visited.push("enterUnaryNumericExpression"),
    exitUnaryNumericExpression: () => visited.push("exitUnaryNumericExpression"),
    enterLikeExpression: () => visited.push("enterLikeExpression"),
    exitLikeExpression: () => visited.push("exitLikeExpression"),
    enterExistsExpression: () => visited.push("enterExistsExpression"),
    exitExistsExpression: () => visited.push("exitExistsExpression"),
    enterInExpression: () => visited.push("enterInExpression"),
    exitInExpression: () => visited.push("exitInExpression"),
    enterBinaryMultiplicativeExpression: () => visited.push("enterBinaryMultiplicativeExpression"),
    exitBinaryMultiplicativeExpression: () => visited.push("exitBinaryMultiplicativeExpression"),
    enterBinaryAdditiveExpression: () => visited.push("enterBinaryAdditiveExpression"),
    exitBinaryAdditiveExpression: () => visited.push("exitBinaryAdditiveExpression"),
    enterBinaryComparisonExpression: () => visited.push("enterBinaryComparisonExpression"),
    exitBinaryComparisonExpression: () => visited.push("exitBinaryComparisonExpression"),
    enterBinaryLogicExpression: () => visited.push("enterBinaryLogicExpression"),
    exitBinaryLogicExpression: () => visited.push("exitBinaryLogicExpression"),
    enterSubExpression: () => visited.push("enterSubExpression"),
    exitSubExpression: () => visited.push("exitSubExpression"),
    enterAtomExpression: () => visited.push("enterAtomExpression"),
    exitAtomExpression: () => visited.push("exitAtomExpression"),
    enterBooleanAtom: () => visited.push("enterBooleanAtom"),
    exitBooleanAtom: () => visited.push("exitBooleanAtom"),
    enterIntegerAtom: () => visited.push("enterIntegerAtom"),
    exitIntegerAtom: () => visited.push("exitIntegerAtom"),
    enterStringAtom: () => visited.push("enterStringAtom"),
    exitStringAtom: () => visited.push("exitStringAtom"),
    enterIdentifierAtom: () => visited.push("enterIdentifierAtom"),
    exitIdentifierAtom: () => visited.push("exitIdentifierAtom"),
    enterIdentifier: () => visited.push("enterIdentifier"),
    exitIdentifier: () => visited.push("exitIdentifier"),
    enterFunctionIdentifier: () => visited.push("enterFunctionIdentifier"),
    exitFunctionIdentifier: () => visited.push("exitFunctionIdentifier"),
    enterBooleanLiteral: () => visited.push("enterBooleanLiteral"),
    exitBooleanLiteral: () => visited.push("exitBooleanLiteral"),
    enterStringLiteral: () => visited.push("enterStringLiteral"),
    exitStringLiteral: () => visited.push("exitStringLiteral"),
    enterIntegerLiteral: () => visited.push("enterIntegerLiteral"),
    exitIntegerLiteral: () => visited.push("exitIntegerLiteral"),
    enterFunctionParameterList: () => visited.push("enterFunctionParameterList"),
    exitFunctionParameterList: () => visited.push("exitFunctionParameterList"),
    enterSetExpression: () => visited.push("enterSetExpression"),
    exitSetExpression: () => visited.push("exitSetExpression")
  };

  // Parse a complex expression that covers all expression types:
  // - function invocation: UPPER(subject)
  // - binary comparison: ... = 'PLOP'
  // - binary logic: AND, OR
  // - binary multiplicative: 2 * 3
  // - binary additive: ... + 1
  // - unary logic: NOT
  // - unary numeric: -1
  // - sub expression: (...)
  // - exists: EXISTS subject
  // - like: ... LIKE ...
  // - in: ... IN (...)
  // - atoms: boolean, integer, string, identifier

  // Expression 1: function + comparison + logic + multiplicative + additive
  const expr1 = `UPPER(subject) = 'PLOP' AND 2 * 3 + 1 > 5 OR NOT (TRUE) OR -1 < 0`;
  let lexer = new CESQLParserLexer(new ANTLRInputStream(expr1));
  let tokenStream = new CommonTokenStream(lexer);
  let parser = new CESQLParserParser(tokenStream);
  let tree = parser.cesql();
  ParseTreeWalker.DEFAULT.walk(listener, tree);

  expect(visited).toContain("enterCesql");
  expect(visited).toContain("exitCesql");
  expect(visited).toContain("enterFunctionInvocationExpression");
  expect(visited).toContain("exitFunctionInvocationExpression");
  expect(visited).toContain("enterBinaryComparisonExpression");
  expect(visited).toContain("exitBinaryComparisonExpression");
  expect(visited).toContain("enterBinaryLogicExpression");
  expect(visited).toContain("exitBinaryLogicExpression");
  expect(visited).toContain("enterBinaryMultiplicativeExpression");
  expect(visited).toContain("exitBinaryMultiplicativeExpression");
  expect(visited).toContain("enterBinaryAdditiveExpression");
  expect(visited).toContain("exitBinaryAdditiveExpression");
  expect(visited).toContain("enterUnaryLogicExpression");
  expect(visited).toContain("exitUnaryLogicExpression");
  expect(visited).toContain("enterUnaryNumericExpression");
  expect(visited).toContain("exitUnaryNumericExpression");
  expect(visited).toContain("enterSubExpression");
  expect(visited).toContain("exitSubExpression");
  expect(visited).toContain("enterBooleanAtom");
  expect(visited).toContain("exitBooleanAtom");
  expect(visited).toContain("enterIntegerAtom");
  expect(visited).toContain("exitIntegerAtom");
  expect(visited).toContain("enterStringAtom");
  expect(visited).toContain("exitStringAtom");
  expect(visited).toContain("enterIdentifierAtom");
  expect(visited).toContain("exitIdentifierAtom");
  expect(visited).toContain("enterFunctionIdentifier");
  expect(visited).toContain("exitFunctionIdentifier");
  expect(visited).toContain("enterBooleanLiteral");
  expect(visited).toContain("exitBooleanLiteral");
  expect(visited).toContain("enterStringLiteral");
  expect(visited).toContain("exitStringLiteral");
  expect(visited).toContain("enterIntegerLiteral");
  expect(visited).toContain("exitIntegerLiteral");
  expect(visited).toContain("enterFunctionParameterList");
  expect(visited).toContain("exitFunctionParameterList");
  expect(visited).toContain("enterAtomExpression");
  expect(visited).toContain("exitAtomExpression");
  expect(visited).toContain("enterIdentifier");
  expect(visited).toContain("exitIdentifier");

  // Expression 2: EXISTS + LIKE + IN
  visited.length = 0;
  lexer = new CESQLParserLexer(new ANTLRInputStream(`EXISTS subject AND subject LIKE "p%" AND subject IN ("a", "b")`));
  tokenStream = new CommonTokenStream(lexer);
  parser = new CESQLParserParser(tokenStream);
  tree = parser.cesql();
  ParseTreeWalker.DEFAULT.walk(listener, tree);

  expect(visited).toContain("enterExistsExpression");
  expect(visited).toContain("exitExistsExpression");
  expect(visited).toContain("enterLikeExpression");
  expect(visited).toContain("exitLikeExpression");
  expect(visited).toContain("enterInExpression");
  expect(visited).toContain("exitInExpression");
  expect(visited).toContain("enterSetExpression");
  expect(visited).toContain("exitSetExpression");
});

test("ANTLR context class token accessors", () => {
  // Parse expression with multiplicative operators to exercise token getters
  // STAR
  let lexer = new CESQLParserLexer(new ANTLRInputStream("2 * 3 = 6"));
  let tokenStream = new CommonTokenStream(lexer);
  let parser = new CESQLParserParser(tokenStream);
  let tree = parser.cesql();
  // Access the parse tree structure to exercise ruleIndex and token accessors
  const exprCtx = tree.expression();
  expect(exprCtx).toBeDefined();
  expect(tree.ruleIndex).toBe(CESQLParserParser.RULE_cesql);
  expect(tree.EOF()).toBeDefined();

  // DIVIDE
  lexer = new CESQLParserLexer(new ANTLRInputStream("6 / 2 = 3"));
  tokenStream = new CommonTokenStream(lexer);
  parser = new CESQLParserParser(tokenStream);
  tree = parser.cesql();
  expect(tree.expression()).toBeDefined();

  // MODULE
  lexer = new CESQLParserLexer(new ANTLRInputStream("7 % 3 = 1"));
  tokenStream = new CommonTokenStream(lexer);
  parser = new CESQLParserParser(tokenStream);
  tree = parser.cesql();
  expect(tree.expression()).toBeDefined();

  // PLUS and MINUS
  lexer = new CESQLParserLexer(new ANTLRInputStream("2 + 3 - 1 = 4"));
  tokenStream = new CommonTokenStream(lexer);
  parser = new CESQLParserParser(tokenStream);
  tree = parser.cesql();
  expect(tree.expression()).toBeDefined();

  // All comparison operators
  for (const op of ["=", "!=", ">", ">=", "<", "<>", "<="]) {
    lexer = new CESQLParserLexer(new ANTLRInputStream(`1 ${op} 2`));
    tokenStream = new CommonTokenStream(lexer);
    parser = new CESQLParserParser(tokenStream);
    tree = parser.cesql();
    expect(tree.expression()).toBeDefined();
  }

  // Logic operators: AND, OR, XOR
  for (const op of ["AND", "OR", "XOR"]) {
    lexer = new CESQLParserLexer(new ANTLRInputStream(`TRUE ${op} FALSE`));
    tokenStream = new CommonTokenStream(lexer);
    parser = new CESQLParserParser(tokenStream);
    tree = parser.cesql();
    expect(tree.expression()).toBeDefined();
  }

  // NOT LIKE and NOT IN
  lexer = new CESQLParserLexer(new ANTLRInputStream(`subject NOT LIKE "test" AND subject NOT IN ("a", "b")`));
  tokenStream = new CommonTokenStream(lexer);
  parser = new CESQLParserParser(tokenStream);
  tree = parser.cesql();
  expect(tree.expression()).toBeDefined();

  // Function with no parameters
  lexer = new CESQLParserLexer(new ANTLRInputStream(`UPPER()`));
  tokenStream = new CommonTokenStream(lexer);
  parser = new CESQLParserParser(tokenStream);
  tree = parser.cesql();
  expect(tree.expression()).toBeDefined();

  // IDENTIFIER_WITH_NUMBER token type (identifiers containing digits)
  lexer = new CESQLParserLexer(new ANTLRInputStream(`field1 = "test"`));
  tokenStream = new CommonTokenStream(lexer);
  parser = new CESQLParserParser(tokenStream);
  tree = parser.cesql();
  expect(tree.expression()).toBeDefined();
});

test("ANTLR context accept with empty visitor (visitChildren branch)", () => {
  // Use a visitor that does NOT have the specific visit methods defined
  // This exercises the else branches of accept() methods
  const lexer = new CESQLParserLexer(
    new ANTLRInputStream(`UPPER(subject) = 'PLOP' AND 2 * 3 + 1 > 5 AND subject LIKE "p%" AND EXISTS topic AND subject IN ("a") AND NOT FALSE AND -1 < (0) OR TRUE XOR FALSE`)
  );
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new CESQLParserParser(tokenStream);
  const tree = parser.cesql();

  // Create a minimal visitor that only implements visitChildren
  // Since the CESQLExpressionBuilder is the visitor used, and it already covers the "if" branches,
  // here we walk the tree with accept and an empty visitor to exercise the else branches
  const emptyVisitor = {
    visit: () => undefined,
    visitChildren: () => undefined,
    visitTerminal: () => undefined,
    visitErrorNode: () => undefined
  };

  // Call accept on the tree directly - it will fall through to visitChildren
  tree.accept(emptyVisitor);
});

test("ANTLR context <> operator parsed but not implemented in visitor", () => {
  // The <> operator is recognized by the ANTLR grammar but the visitor throws "Not implemented"
  // This exercises the parser handling of LESS_GREATER token
  const lexer = new CESQLParserLexer(new ANTLRInputStream("1 <> 2"));
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new CESQLParserParser(tokenStream);
  const tree = parser.cesql();
  // Parse tree is valid even though visitor doesn't handle <>
  expect(tree.expression()).toBeDefined();
});

test("SQLFilter FALSE literal", () => {
  expect(
    FiltersHelper.get({
      sql: "FALSE"
    }).match(event)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: "NOT FALSE"
    }).match(event)
  ).toBe(true);
});

test("SQLFilter complex nested expressions", () => {
  // Deeply nested parentheses
  expect(
    FiltersHelper.get({
      sql: "((1 + 2) * (3 - 1)) = 6"
    }).match(event)
  ).toBe(true);

  // Multiple AND/OR/XOR combined
  expect(
    FiltersHelper.get({
      sql: `TRUE AND TRUE AND TRUE`
    }).match(event)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `FALSE OR FALSE OR TRUE`
    }).match(event)
  ).toBe(true);

  // Nested functions
  expect(
    FiltersHelper.get({
      sql: `UPPER(LOWER(TRIM(" Hello "))) = "HELLO"`
    }).match(event2)
  ).toBe(true);

  // Complex arithmetic with all operators
  expect(
    FiltersHelper.get({
      sql: "(10 % 3 + 2 * 3 - 1) / 2 = 3"
    }).match(event)
  ).toBe(true);
});

test("SQLFilter with IDENTIFIER_WITH_NUMBER", () => {
  // Identifiers with numbers should parse correctly
  const eventWithNumbers = new CloudEvent({
    type: "com.test",
    source: "unit-test",
    field1: "value1",
    data: {}
  });

  expect(
    FiltersHelper.get({
      sql: `EXISTS field1`
    }).match(eventWithNumbers)
  ).toBe(true);
});

test("ANTLR context class getter and accessor methods", () => {
  // Helper function to parse and return the tree
  function parse(sql: string) {
    const lexer = new CESQLParserLexer(new ANTLRInputStream(sql));
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new CESQLParserParser(tokenStream);
    return parser.cesql();
  }

  // Test BinaryMultiplicativeExpressionContext accessors: STAR, DIVIDE, MODULE, expression(i), expression()
  {
    const tree = parse("2 * 3 = 6");
    const visitor = {
      found: null as any,
      visitBinaryMultiplicativeExpression(ctx: BinaryMultiplicativeExpressionContext) {
        this.found = ctx;
      }
    };
    // Walk using listener to find the context
    const listener: CESQLParserListener = {
      enterBinaryMultiplicativeExpression: (ctx) => {
        // Access all token getters
        expect(ctx.STAR()).toBeDefined();
        expect(ctx.DIVIDE()).toBeUndefined();
        expect(ctx.MODULE()).toBeUndefined();
        // Access overloaded expression methods
        expect(ctx.expression()).toBeDefined(); // array form
        expect(ctx.expression(0)).toBeDefined(); // single form
        expect(ctx.expression(1)).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // DIVIDE accessor
  {
    const tree = parse("6 / 2 = 3");
    const listener: CESQLParserListener = {
      enterBinaryMultiplicativeExpression: (ctx) => {
        expect(ctx.DIVIDE()).toBeDefined();
        expect(ctx.STAR()).toBeUndefined();
        expect(ctx.MODULE()).toBeUndefined();
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // MODULE accessor
  {
    const tree = parse("7 % 3 = 1");
    const listener: CESQLParserListener = {
      enterBinaryMultiplicativeExpression: (ctx) => {
        expect(ctx.MODULE()).toBeDefined();
        expect(ctx.STAR()).toBeUndefined();
        expect(ctx.DIVIDE()).toBeUndefined();
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test BinaryAdditiveExpressionContext accessors: PLUS, MINUS, expression()
  {
    const tree = parse("2 + 3 = 5");
    const listener: CESQLParserListener = {
      enterBinaryAdditiveExpression: (ctx) => {
        expect(ctx.PLUS()).toBeDefined();
        expect(ctx.MINUS()).toBeUndefined();
        expect(ctx.expression()).toBeDefined();
        expect(ctx.expression(0)).toBeDefined();
        expect(ctx.expression(1)).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // MINUS on BinaryAdditiveExpression
  {
    const tree = parse("5 - 2 = 3");
    const listener: CESQLParserListener = {
      enterBinaryAdditiveExpression: (ctx) => {
        expect(ctx.MINUS()).toBeDefined();
        expect(ctx.PLUS()).toBeUndefined();
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test BinaryComparisonExpressionContext accessors: all comparison operators
  {
    const ops = [
      { sql: "1 = 2", getter: "EQUAL" },
      { sql: "1 != 2", getter: "NOT_EQUAL" },
      { sql: "1 > 2", getter: "GREATER" },
      { sql: "1 >= 2", getter: "GREATER_OR_EQUAL" },
      { sql: "1 < 2", getter: "LESS" },
      { sql: "1 <= 2", getter: "LESS_OR_EQUAL" }
    ];
    for (const { sql, getter } of ops) {
      const tree = parse(sql);
      const listener: CESQLParserListener = {
        enterBinaryComparisonExpression: (ctx) => {
          // Access all possible comparison token getters
          ctx.EQUAL();
          ctx.NOT_EQUAL();
          ctx.GREATER();
          ctx.GREATER_OR_EQUAL();
          ctx.LESS();
          ctx.LESS_GREATER();
          ctx.LESS_OR_EQUAL();
          // Overloaded expression
          ctx.expression();
          ctx.expression(0);
          ctx.expression(1);
          expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
        }
      };
      ParseTreeWalker.DEFAULT.walk(listener, tree);
    }
  }

  // Test BinaryLogicExpressionContext accessors: AND, OR, XOR
  {
    const logicOps = [
      { sql: "TRUE AND FALSE", getter: "AND" },
      { sql: "TRUE OR FALSE", getter: "OR" },
      { sql: "TRUE XOR FALSE", getter: "XOR" }
    ];
    for (const { sql } of logicOps) {
      const tree = parse(sql);
      const listener: CESQLParserListener = {
        enterBinaryLogicExpression: (ctx) => {
          ctx.AND();
          ctx.OR();
          ctx.XOR();
          ctx.expression();
          ctx.expression(0);
          ctx.expression(1);
          expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
        }
      };
      ParseTreeWalker.DEFAULT.walk(listener, tree);
    }
  }

  // Test LikeExpressionContext accessors
  {
    const tree = parse(`subject LIKE "test"`);
    const listener: CESQLParserListener = {
      enterLikeExpression: (ctx) => {
        expect(ctx.expression()).toBeDefined();
        expect(ctx.LIKE()).toBeDefined();
        expect(ctx.stringLiteral()).toBeDefined();
        expect(ctx.NOT()).toBeUndefined(); // no NOT keyword
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test LikeExpressionContext with NOT
  {
    const tree = parse(`subject NOT LIKE "test"`);
    const listener: CESQLParserListener = {
      enterLikeExpression: (ctx) => {
        expect(ctx.NOT()).toBeDefined();
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test InExpressionContext accessors
  {
    const tree = parse(`subject IN ("a", "b")`);
    const listener: CESQLParserListener = {
      enterInExpression: (ctx) => {
        expect(ctx.expression()).toBeDefined();
        expect(ctx.IN()).toBeDefined();
        expect(ctx.setExpression()).toBeDefined();
        expect(ctx.NOT()).toBeUndefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test InExpressionContext with NOT
  {
    const tree = parse(`subject NOT IN ("a")`);
    const listener: CESQLParserListener = {
      enterInExpression: (ctx) => {
        expect(ctx.NOT()).toBeDefined();
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test ExistsExpressionContext accessors
  {
    const tree = parse(`EXISTS subject`);
    const listener: CESQLParserListener = {
      enterExistsExpression: (ctx) => {
        expect(ctx.EXISTS()).toBeDefined();
        expect(ctx.identifier()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test UnaryLogicExpressionContext accessors
  {
    const tree = parse(`NOT TRUE`);
    const listener: CESQLParserListener = {
      enterUnaryLogicExpression: (ctx) => {
        expect(ctx.NOT()).toBeDefined();
        expect(ctx.expression()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test UnaryNumericExpressionContext accessors
  {
    const tree = parse(`-1 = -1`);
    const listener: CESQLParserListener = {
      enterUnaryNumericExpression: (ctx) => {
        expect(ctx.MINUS()).toBeDefined();
        expect(ctx.expression()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test SubExpressionContext accessors
  {
    const tree = parse(`(1 + 2) = 3`);
    const listener: CESQLParserListener = {
      enterSubExpression: (ctx) => {
        expect(ctx.LR_BRACKET()).toBeDefined();
        expect(ctx.expression()).toBeDefined();
        expect(ctx.RR_BRACKET()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test AtomExpressionContext accessors
  {
    const tree = parse(`TRUE`);
    const listener: CESQLParserListener = {
      enterAtomExpression: (ctx) => {
        expect(ctx.atom()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test FunctionInvocationExpressionContext accessors
  {
    const tree = parse(`UPPER("test")`);
    const listener: CESQLParserListener = {
      enterFunctionInvocationExpression: (ctx) => {
        expect(ctx.functionIdentifier()).toBeDefined();
        expect(ctx.functionParameterList()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_expression);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test AtomContext subclass accessors: BooleanAtomContext
  {
    const tree = parse(`TRUE`);
    const listener: CESQLParserListener = {
      enterBooleanAtom: (ctx) => {
        expect(ctx.booleanLiteral()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_atom);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // IntegerAtomContext
  {
    const tree = parse(`42 = 42`);
    const listener: CESQLParserListener = {
      enterIntegerAtom: (ctx) => {
        expect(ctx.integerLiteral()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_atom);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // StringAtomContext
  {
    const tree = parse(`"hello" = "hello"`);
    const listener: CESQLParserListener = {
      enterStringAtom: (ctx) => {
        expect(ctx.stringLiteral()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_atom);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // IdentifierAtomContext
  {
    const tree = parse(`subject = "test"`);
    const listener: CESQLParserListener = {
      enterIdentifierAtom: (ctx) => {
        expect(ctx.identifier()).toBeDefined();
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_atom);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test IdentifierContext accessors
  {
    const tree = parse(`subject = "test"`);
    const listener: CESQLParserListener = {
      enterIdentifier: (ctx) => {
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_identifier);
        // One of these should be defined
        const id = ctx.IDENTIFIER();
        const idNum = ctx.IDENTIFIER_WITH_NUMBER();
        expect(id !== undefined || idNum !== undefined).toBe(true);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test FunctionIdentifierContext accessors
  {
    const tree = parse(`UPPER("test")`);
    const listener: CESQLParserListener = {
      enterFunctionIdentifier: (ctx) => {
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_functionIdentifier);
        const id = ctx.IDENTIFIER();
        const fn = ctx.FUNCTION_IDENTIFIER_WITH_UNDERSCORE();
        expect(id !== undefined || fn !== undefined).toBe(true);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test FUNCTION_IDENTIFIER_WITH_UNDERSCORE with underscore function
  {
    const tree = parse(`IS_BOOL(TRUE)`);
    const listener: CESQLParserListener = {
      enterFunctionIdentifier: (ctx) => {
        expect(ctx.FUNCTION_IDENTIFIER_WITH_UNDERSCORE()).toBeDefined();
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test BooleanLiteralContext accessors
  {
    const tree = parse(`TRUE`);
    const listener: CESQLParserListener = {
      enterBooleanLiteral: (ctx) => {
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_booleanLiteral);
        expect(ctx.TRUE()).toBeDefined();
        expect(ctx.FALSE()).toBeUndefined();
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  {
    const tree = parse(`FALSE`);
    const listener: CESQLParserListener = {
      enterBooleanLiteral: (ctx) => {
        expect(ctx.FALSE()).toBeDefined();
        expect(ctx.TRUE()).toBeUndefined();
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test StringLiteralContext accessors
  {
    const tree = parse(`"test" = "test"`);
    const listener: CESQLParserListener = {
      enterStringLiteral: (ctx) => {
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_stringLiteral);
        const dq = ctx.DQUOTED_STRING_LITERAL();
        const sq = ctx.SQUOTED_STRING_LITERAL();
        expect(dq !== undefined || sq !== undefined).toBe(true);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test IntegerLiteralContext accessors
  {
    const tree = parse(`42 = 42`);
    const listener: CESQLParserListener = {
      enterIntegerLiteral: (ctx) => {
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_integerLiteral);
        expect(ctx.INTEGER_LITERAL()).toBeDefined();
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test FunctionParameterListContext accessors
  {
    const tree = parse(`CONCAT("a", "b")`);
    const listener: CESQLParserListener = {
      enterFunctionParameterList: (ctx) => {
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_functionParameterList);
        expect(ctx.LR_BRACKET()).toBeDefined();
        expect(ctx.RR_BRACKET()).toBeDefined();
        // Overloaded expression methods
        expect(ctx.expression()).toBeDefined(); // array
        expect(ctx.expression(0)).toBeDefined(); // single
        // Overloaded COMMA methods
        expect(ctx.COMMA()).toBeDefined(); // array
        expect(ctx.COMMA(0)).toBeDefined(); // single
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test SetExpressionContext accessors
  {
    const tree = parse(`subject IN ("a", "b", "c")`);
    const listener: CESQLParserListener = {
      enterSetExpression: (ctx) => {
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_setExpression);
        expect(ctx.LR_BRACKET()).toBeDefined();
        expect(ctx.RR_BRACKET()).toBeDefined();
        // Overloaded expression methods
        expect(ctx.expression()).toBeDefined(); // array
        expect(ctx.expression(0)).toBeDefined(); // single
        // Overloaded COMMA methods
        expect(ctx.COMMA()).toBeDefined(); // array
        expect(ctx.COMMA(0)).toBeDefined(); // single
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }

  // Test CesqlContext accessors
  {
    const tree = parse(`TRUE`);
    expect(tree.ruleIndex).toBe(CESQLParserParser.RULE_cesql);
    expect(tree.expression()).toBeDefined();
    expect(tree.EOF()).toBeDefined();
  }

  // Exercise ExpressionContext.copyFrom and ruleIndex
  {
    const tree = parse(`1 + 2`);
    expect(tree.expression().ruleIndex).toBe(CESQLParserParser.RULE_expression);
  }

  // Exercise AtomContext.ruleIndex and copyFrom
  {
    const tree = parse(`TRUE`);
    const listener: CESQLParserListener = {
      enterBooleanAtom: (ctx) => {
        expect(ctx.ruleIndex).toBe(CESQLParserParser.RULE_atom);
      }
    };
    ParseTreeWalker.DEFAULT.walk(listener, tree);
  }
});

test("ANTLR parser sempred coverage", () => {
  // The sempred method is called during parsing for precedence predicates
  // Parsing complex expressions with varying precedences exercises all predIndex cases
  function parse(sql: string) {
    const lexer = new CESQLParserLexer(new ANTLRInputStream(sql));
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new CESQLParserParser(tokenStream);
    return parser.cesql();
  }

  // Exercise sempred with different precedence levels
  // predIndex 0: precpred(6) - multiplicative
  expect(parse("2 * 3 * 4 = 24")).toBeDefined();
  // predIndex 1: precpred(5) - additive
  expect(parse("1 + 2 + 3 = 6")).toBeDefined();
  // predIndex 2: precpred(4) - comparison
  expect(parse("1 < 2")).toBeDefined();
  // predIndex 3: precpred(3) - logic
  expect(parse("TRUE AND FALSE OR TRUE")).toBeDefined();
  // predIndex 4: precpred(9) - like
  expect(parse(`subject LIKE "test" AND TRUE`)).toBeDefined();
  // predIndex 5: precpred(7) - in
  expect(parse(`subject IN ("a") AND TRUE`)).toBeDefined();

  // Test the sempred method directly with a non-expression rule index
  // This should return true (default)
  const lexer = new CESQLParserLexer(new ANTLRInputStream("TRUE"));
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new CESQLParserParser(tokenStream);
  // Call sempred with a rule index that's not the expression rule
  expect(parser.sempred(null as any, 99, 0)).toBe(true);
});

test("ANTLR parser error recovery branches", () => {
  // Parse invalid expressions to exercise error recovery catch blocks
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    // These parse but generate errors that exercise the catch blocks
    function parseSafe(sql: string) {
      const lexer = new CESQLParserLexer(new ANTLRInputStream(sql));
      const tokenStream = new CommonTokenStream(lexer);
      const parser = new CESQLParserParser(tokenStream);
      parser.removeErrorListeners(); // Suppress error output
      return parser.cesql();
    }

    // Invalid: missing closing paren exercises error recovery in multiple methods
    parseSafe("(1 +");
    // Invalid: just a comma
    parseSafe(",");
    // Empty expression after EXISTS
    parseSafe("EXISTS");
    // Incomplete function call
    parseSafe("UPPER(");
    // Incomplete IN
    parseSafe("x IN (");
    // Incomplete LIKE
    parseSafe("x LIKE");
    // Invalid token in expression position
    parseSafe(")");
  } finally {
    error.mockRestore();
  }
});

test("ANTLR parser createFailedPredicateException", () => {
  // Exercise the createFailedPredicateException method
  const lexer = new CESQLParserLexer(new ANTLRInputStream("TRUE"));
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new CESQLParserParser(tokenStream);

  // The method is protected but accessible - it creates FailedPredicateException objects
  // It's exercised internally during parsing when precedence checks fail
  // Parse a deeply nested expression to exercise precedence prediction
  const tree = parse("1 * 2 + 3 * 4 - 5 / 2 % 3 > 1 AND TRUE OR FALSE XOR TRUE");
  expect(tree).toBeDefined();

  function parse(sql: string) {
    const l = new CESQLParserLexer(new ANTLRInputStream(sql));
    const ts = new CommonTokenStream(l);
    const p = new CESQLParserParser(ts);
    return p.cesql();
  }
});

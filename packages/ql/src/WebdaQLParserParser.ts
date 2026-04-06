// Generated from src/stores/webdaql/WebdaQLParser.g4 by ANTLR 4.9.0-SNAPSHOT

import { ATN } from "antlr4ts/atn/ATN.js";
import { ATNDeserializer } from "antlr4ts/atn/ATNDeserializer.js";
import { ParserATNSimulator } from "antlr4ts/atn/ParserATNSimulator.js";
import { FailedPredicateException } from "antlr4ts/FailedPredicateException.js";
import { NoViableAltException } from "antlr4ts/NoViableAltException.js";
import { Parser } from "antlr4ts/Parser.js";
import { ParserRuleContext } from "antlr4ts/ParserRuleContext.js";
import { RecognitionException } from "antlr4ts/RecognitionException.js";
import { RuleContext } from "antlr4ts/RuleContext.js";
//import { RuleVersion } from "antlr4ts/RuleVersion";
import { Token } from "antlr4ts/Token.js";
import { TokenStream } from "antlr4ts/TokenStream.js";
import { TerminalNode } from "antlr4ts/tree/TerminalNode.js";
import { Vocabulary } from "antlr4ts/Vocabulary.js";
import { VocabularyImpl } from "antlr4ts/VocabularyImpl.js";

import * as Utils from "antlr4ts/misc/Utils.js";

import { WebdaQLParserListener } from "./WebdaQLParserListener";
import { WebdaQLParserVisitor } from "./WebdaQLParserVisitor";

/** ANTLR-generated recursive-descent parser for WebdaQL queries */
export class WebdaQLParserParser extends Parser {
  public static readonly SPACE = 1;
  public static readonly LR_BRACKET = 2;
  public static readonly RR_BRACKET = 3;
  public static readonly COMMA = 4;
  public static readonly SINGLE_QUOTE_SYMB = 5;
  public static readonly DOUBLE_QUOTE_SYMB = 6;
  public static readonly LR_SQ_BRACKET = 7;
  public static readonly RR_SQ_BRACKET = 8;
  public static readonly AND = 9;
  public static readonly OR = 10;
  public static readonly EQUAL = 11;
  public static readonly NOT_EQUAL = 12;
  public static readonly GREATER = 13;
  public static readonly GREATER_OR_EQUAL = 14;
  public static readonly LESS = 15;
  public static readonly LESS_OR_EQUAL = 16;
  public static readonly LIKE = 17;
  public static readonly IN = 18;
  public static readonly CONTAINS = 19;
  public static readonly TRUE = 20;
  public static readonly FALSE = 21;
  public static readonly LIMIT = 22;
  public static readonly OFFSET = 23;
  public static readonly ORDER_BY = 24;
  public static readonly ASC = 25;
  public static readonly DESC = 26;
  public static readonly DQUOTED_STRING_LITERAL = 27;
  public static readonly SQUOTED_STRING_LITERAL = 28;
  public static readonly INTEGER_LITERAL = 29;
  public static readonly IDENTIFIER = 30;
  public static readonly IDENTIFIER_WITH_NUMBER = 31;
  public static readonly FUNCTION_IDENTIFIER_WITH_UNDERSCORE = 32;
  public static readonly RULE_webdaql = 0;
  public static readonly RULE_limitExpression = 1;
  public static readonly RULE_offsetExpression = 2;
  public static readonly RULE_orderFieldExpression = 3;
  public static readonly RULE_orderExpression = 4;
  public static readonly RULE_expression = 5;
  public static readonly RULE_values = 6;
  public static readonly RULE_atom = 7;
  public static readonly RULE_identifier = 8;
  public static readonly RULE_booleanLiteral = 9;
  public static readonly RULE_stringLiteral = 10;
  public static readonly RULE_integerLiteral = 11;
  public static readonly RULE_setExpression = 12;
  // tslint:disable:no-trailing-whitespace
  public static readonly ruleNames: string[] = [
    "webdaql",
    "limitExpression",
    "offsetExpression",
    "orderFieldExpression",
    "orderExpression",
    "expression",
    "values",
    "atom",
    "identifier",
    "booleanLiteral",
    "stringLiteral",
    "integerLiteral",
    "setExpression"
  ];

  private static readonly _LITERAL_NAMES: Array<string | undefined> = [
    undefined,
    undefined,
    "'('",
    "')'",
    "','",
    "'''",
    "'\"'",
    "'['",
    "']'",
    "'AND'",
    "'OR'",
    "'='",
    "'!='",
    "'>'",
    "'>='",
    "'<'",
    "'<='",
    "'LIKE'",
    "'IN'",
    "'CONTAINS'",
    "'TRUE'",
    "'FALSE'",
    "'LIMIT'",
    "'OFFSET'",
    "'ORDER BY'",
    "'ASC'",
    "'DESC'"
  ];
  private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
    undefined,
    "SPACE",
    "LR_BRACKET",
    "RR_BRACKET",
    "COMMA",
    "SINGLE_QUOTE_SYMB",
    "DOUBLE_QUOTE_SYMB",
    "LR_SQ_BRACKET",
    "RR_SQ_BRACKET",
    "AND",
    "OR",
    "EQUAL",
    "NOT_EQUAL",
    "GREATER",
    "GREATER_OR_EQUAL",
    "LESS",
    "LESS_OR_EQUAL",
    "LIKE",
    "IN",
    "CONTAINS",
    "TRUE",
    "FALSE",
    "LIMIT",
    "OFFSET",
    "ORDER_BY",
    "ASC",
    "DESC",
    "DQUOTED_STRING_LITERAL",
    "SQUOTED_STRING_LITERAL",
    "INTEGER_LITERAL",
    "IDENTIFIER",
    "IDENTIFIER_WITH_NUMBER",
    "FUNCTION_IDENTIFIER_WITH_UNDERSCORE"
  ];
  public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(
    WebdaQLParserParser._LITERAL_NAMES,
    WebdaQLParserParser._SYMBOLIC_NAMES,
    []
  );

  // @Override
  // @NotNull
  /** Get the vocabulary for this parser */
  public get vocabulary(): Vocabulary {
    return WebdaQLParserParser.VOCABULARY;
  }
  // tslint:enable:no-trailing-whitespace

  // @Override
  /** Get the grammar file name */
  public get grammarFileName(): string {
    return "WebdaQLParser.g4";
  }

  // @Override
  /** Get the rule names */
  public get ruleNames(): string[] {
    return WebdaQLParserParser.ruleNames;
  }

  // @Override
  /** Get the serialized ATN */
  public get serializedATN(): string {
    return WebdaQLParserParser._serializedATN;
  }

  /** Create a FailedPredicateException for semantic predicate failures */
  protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException {
    return new FailedPredicateException(this, predicate, message);
  }

  /** Create a new parser for the given token stream */
  constructor(input: TokenStream) {
    super(input);
    this._interp = new ParserATNSimulator(WebdaQLParserParser._ATN, this);
  }
  // @RuleVersion(0)
  /** Parse the top-level webdaql rule (expression + optional ORDER BY, LIMIT, OFFSET) */
  public webdaql(): WebdaqlContext {
    const _localctx: WebdaqlContext = new WebdaqlContext(this._ctx, this.state);
    this.enterRule(_localctx, 0, WebdaQLParserParser.RULE_webdaql);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 27;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (
          (_la & ~0x1f) === 0 &&
          ((1 << _la) &
            ((1 << WebdaQLParserParser.LR_BRACKET) |
              (1 << WebdaQLParserParser.TRUE) |
              (1 << WebdaQLParserParser.FALSE) |
              (1 << WebdaQLParserParser.DQUOTED_STRING_LITERAL) |
              (1 << WebdaQLParserParser.SQUOTED_STRING_LITERAL) |
              (1 << WebdaQLParserParser.INTEGER_LITERAL) |
              (1 << WebdaQLParserParser.IDENTIFIER) |
              (1 << WebdaQLParserParser.IDENTIFIER_WITH_NUMBER))) !==
            0
        ) {
          {
            this.state = 26;
            this.expression(0);
          }
        }

        this.state = 30;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.ORDER_BY) {
          {
            this.state = 29;
            this.orderExpression();
          }
        }

        this.state = 33;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.LIMIT) {
          {
            this.state = 32;
            this.limitExpression();
          }
        }

        this.state = 36;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.OFFSET) {
          {
            this.state = 35;
            this.offsetExpression();
          }
        }

        this.state = 38;
        this.match(WebdaQLParserParser.EOF);
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse a LIMIT clause */
  public limitExpression(): LimitExpressionContext {
    const _localctx: LimitExpressionContext = new LimitExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 2, WebdaQLParserParser.RULE_limitExpression);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 40;
        this.match(WebdaQLParserParser.LIMIT);
        this.state = 41;
        this.integerLiteral();
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse an OFFSET clause */
  public offsetExpression(): OffsetExpressionContext {
    const _localctx: OffsetExpressionContext = new OffsetExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 4, WebdaQLParserParser.RULE_offsetExpression);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 43;
        this.match(WebdaQLParserParser.OFFSET);
        this.state = 44;
        this.stringLiteral();
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse a single ORDER BY field with optional ASC/DESC direction */
  public orderFieldExpression(): OrderFieldExpressionContext {
    const _localctx: OrderFieldExpressionContext = new OrderFieldExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 6, WebdaQLParserParser.RULE_orderFieldExpression);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 46;
        this.identifier();
        this.state = 48;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.ASC || _la === WebdaQLParserParser.DESC) {
          {
            this.state = 47;
            _la = this._input.LA(1);
            if (!(_la === WebdaQLParserParser.ASC || _la === WebdaQLParserParser.DESC)) {
              this._errHandler.recoverInline(this);
            } else {
              if (this._input.LA(1) === Token.EOF) {
                this.matchedEOF = true;
              }

              this._errHandler.reportMatch(this);
              this.consume();
            }
          }
        }
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse an ORDER BY clause with one or more field expressions */
  public orderExpression(): OrderExpressionContext {
    const _localctx: OrderExpressionContext = new OrderExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 8, WebdaQLParserParser.RULE_orderExpression);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 50;
        this.match(WebdaQLParserParser.ORDER_BY);
        this.state = 51;
        this.orderFieldExpression();
        this.state = 56;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while (_la === WebdaQLParserParser.COMMA) {
          {
            {
              this.state = 52;
              this.match(WebdaQLParserParser.COMMA);
              this.state = 53;
              this.orderFieldExpression();
            }
          }
          this.state = 58;
          this._errHandler.sync(this);
          _la = this._input.LA(1);
        }
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }

  /** Parse a filter expression (comparison, logical, or sub-expression) */
  public expression(): ExpressionContext;
  /** Parse a filter expression with precedence level */
  public expression(_p: number): ExpressionContext;
  // @RuleVersion(0)
  /** Parse a filter expression with optional precedence climbing */
  public expression(_p?: number): ExpressionContext {
    if (_p === undefined) {
      _p = 0;
    }

    const _parentctx: ParserRuleContext = this._ctx;
    const _parentState: number = this.state;
    let _localctx: ExpressionContext = new ExpressionContext(this._ctx, _parentState);
    let _prevctx: ExpressionContext = _localctx;
    const _startState: number = 10;
    this.enterRecursionRule(_localctx, 10, WebdaQLParserParser.RULE_expression, _p);
    let _la: number;
    try {
      let _alt: number;
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 81;
        this._errHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this._input, 6, this._ctx)) {
          case 1:
            {
              _localctx = new LikeExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;

              this.state = 60;
              this.identifier();
              this.state = 61;
              this.match(WebdaQLParserParser.LIKE);
              this.state = 62;
              this.stringLiteral();
            }
            break;

          case 2:
            {
              _localctx = new InExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 64;
              this.identifier();
              this.state = 65;
              this.match(WebdaQLParserParser.IN);
              this.state = 66;
              this.setExpression();
            }
            break;

          case 3:
            {
              _localctx = new ContainsExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 68;
              this.identifier();
              this.state = 69;
              this.match(WebdaQLParserParser.CONTAINS);
              this.state = 70;
              this.stringLiteral();
            }
            break;

          case 4:
            {
              _localctx = new BinaryComparisonExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 72;
              this.identifier();
              this.state = 73;
              _la = this._input.LA(1);
              if (
                !(
                  (_la & ~0x1f) === 0 &&
                  ((1 << _la) &
                    ((1 << WebdaQLParserParser.EQUAL) |
                      (1 << WebdaQLParserParser.NOT_EQUAL) |
                      (1 << WebdaQLParserParser.GREATER) |
                      (1 << WebdaQLParserParser.GREATER_OR_EQUAL) |
                      (1 << WebdaQLParserParser.LESS) |
                      (1 << WebdaQLParserParser.LESS_OR_EQUAL))) !==
                    0
                )
              ) {
                this._errHandler.recoverInline(this);
              } else {
                if (this._input.LA(1) === Token.EOF) {
                  this.matchedEOF = true;
                }

                this._errHandler.reportMatch(this);
                this.consume();
              }
              this.state = 74;
              this.values();
            }
            break;

          case 5:
            {
              _localctx = new SubExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 76;
              this.match(WebdaQLParserParser.LR_BRACKET);
              this.state = 77;
              this.expression(0);
              this.state = 78;
              this.match(WebdaQLParserParser.RR_BRACKET);
            }
            break;

          case 6:
            {
              _localctx = new AtomExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 80;
              this.atom();
            }
            break;
        }
        this._ctx._stop = this._input.tryLT(-1);
        this.state = 91;
        this._errHandler.sync(this);
        _alt = this.interpreter.adaptivePredict(this._input, 8, this._ctx);
        while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
          if (_alt === 1) {
            if (this._parseListeners != null) {
              this.triggerExitRuleEvent();
            }
            _prevctx = _localctx;
            {
              this.state = 89;
              this._errHandler.sync(this);
              switch (this.interpreter.adaptivePredict(this._input, 7, this._ctx)) {
                case 1:
                  {
                    _localctx = new AndLogicExpressionContext(new ExpressionContext(_parentctx, _parentState));
                    this.pushNewRecursionContext(_localctx, _startState, WebdaQLParserParser.RULE_expression);
                    this.state = 83;
                    if (!this.precpred(this._ctx, 4)) {
                      throw this.createFailedPredicateException("this.precpred(this._ctx, 4)");
                    }
                    this.state = 84;
                    this.match(WebdaQLParserParser.AND);
                    this.state = 85;
                    this.expression(5);
                  }
                  break;

                case 2:
                  {
                    _localctx = new OrLogicExpressionContext(new ExpressionContext(_parentctx, _parentState));
                    this.pushNewRecursionContext(_localctx, _startState, WebdaQLParserParser.RULE_expression);
                    this.state = 86;
                    if (!this.precpred(this._ctx, 3)) {
                      throw this.createFailedPredicateException("this.precpred(this._ctx, 3)");
                    }
                    this.state = 87;
                    this.match(WebdaQLParserParser.OR);
                    this.state = 88;
                    this.expression(4);
                  }
                  break;
              }
            }
          }
          this.state = 93;
          this._errHandler.sync(this);
          _alt = this.interpreter.adaptivePredict(this._input, 8, this._ctx);
        }
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.unrollRecursionContexts(_parentctx);
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse a value literal (boolean, integer, or string) */
  public values(): ValuesContext {
    let _localctx: ValuesContext = new ValuesContext(this._ctx, this.state);
    this.enterRule(_localctx, 12, WebdaQLParserParser.RULE_values);
    try {
      this.state = 97;
      this._errHandler.sync(this);
      switch (this._input.LA(1)) {
        case WebdaQLParserParser.TRUE:
        case WebdaQLParserParser.FALSE:
          _localctx = new BooleanAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 1);
          {
            this.state = 94;
            this.booleanLiteral();
          }
          break;
        case WebdaQLParserParser.INTEGER_LITERAL:
          _localctx = new IntegerAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 2);
          {
            this.state = 95;
            this.integerLiteral();
          }
          break;
        case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
        case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
          _localctx = new StringAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 3);
          {
            this.state = 96;
            this.stringLiteral();
          }
          break;
        default:
          throw new NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse an atom (a value literal or an identifier) */
  public atom(): AtomContext {
    let _localctx: AtomContext = new AtomContext(this._ctx, this.state);
    this.enterRule(_localctx, 14, WebdaQLParserParser.RULE_atom);
    try {
      this.state = 101;
      this._errHandler.sync(this);
      switch (this._input.LA(1)) {
        case WebdaQLParserParser.TRUE:
        case WebdaQLParserParser.FALSE:
        case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
        case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
        case WebdaQLParserParser.INTEGER_LITERAL:
          _localctx = new ValuesAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 1);
          {
            this.state = 99;
            this.values();
          }
          break;
        case WebdaQLParserParser.IDENTIFIER:
        case WebdaQLParserParser.IDENTIFIER_WITH_NUMBER:
          _localctx = new IdentifierAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 2);
          {
            this.state = 100;
            this.identifier();
          }
          break;
        default:
          throw new NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse an identifier (field name, possibly with dots for nested access) */
  public identifier(): IdentifierContext {
    const _localctx: IdentifierContext = new IdentifierContext(this._ctx, this.state);
    this.enterRule(_localctx, 16, WebdaQLParserParser.RULE_identifier);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 103;
        _la = this._input.LA(1);
        if (!(_la === WebdaQLParserParser.IDENTIFIER || _la === WebdaQLParserParser.IDENTIFIER_WITH_NUMBER)) {
          this._errHandler.recoverInline(this);
        } else {
          if (this._input.LA(1) === Token.EOF) {
            this.matchedEOF = true;
          }

          this._errHandler.reportMatch(this);
          this.consume();
        }
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse a boolean literal (TRUE or FALSE) */
  public booleanLiteral(): BooleanLiteralContext {
    const _localctx: BooleanLiteralContext = new BooleanLiteralContext(this._ctx, this.state);
    this.enterRule(_localctx, 18, WebdaQLParserParser.RULE_booleanLiteral);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 105;
        _la = this._input.LA(1);
        if (!(_la === WebdaQLParserParser.TRUE || _la === WebdaQLParserParser.FALSE)) {
          this._errHandler.recoverInline(this);
        } else {
          if (this._input.LA(1) === Token.EOF) {
            this.matchedEOF = true;
          }

          this._errHandler.reportMatch(this);
          this.consume();
        }
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse a string literal (single or double quoted) */
  public stringLiteral(): StringLiteralContext {
    const _localctx: StringLiteralContext = new StringLiteralContext(this._ctx, this.state);
    this.enterRule(_localctx, 20, WebdaQLParserParser.RULE_stringLiteral);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 107;
        _la = this._input.LA(1);
        if (
          !(_la === WebdaQLParserParser.DQUOTED_STRING_LITERAL || _la === WebdaQLParserParser.SQUOTED_STRING_LITERAL)
        ) {
          this._errHandler.recoverInline(this);
        } else {
          if (this._input.LA(1) === Token.EOF) {
            this.matchedEOF = true;
          }

          this._errHandler.reportMatch(this);
          this.consume();
        }
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse an integer literal */
  public integerLiteral(): IntegerLiteralContext {
    const _localctx: IntegerLiteralContext = new IntegerLiteralContext(this._ctx, this.state);
    this.enterRule(_localctx, 22, WebdaQLParserParser.RULE_integerLiteral);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 109;
        this.match(WebdaQLParserParser.INTEGER_LITERAL);
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }
  // @RuleVersion(0)
  /** Parse a set expression (bracket-enclosed list of values, e.g. `['a', 'b']`) */
  public setExpression(): SetExpressionContext {
    const _localctx: SetExpressionContext = new SetExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 24, WebdaQLParserParser.RULE_setExpression);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 111;
        this.match(WebdaQLParserParser.LR_SQ_BRACKET);
        this.state = 112;
        this.values();
        this.state = 117;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while (_la === WebdaQLParserParser.COMMA) {
          {
            {
              this.state = 113;
              this.match(WebdaQLParserParser.COMMA);
              this.state = 114;
              this.values();
            }
          }
          this.state = 119;
          this._errHandler.sync(this);
          _la = this._input.LA(1);
        }
        this.state = 120;
        this.match(WebdaQLParserParser.RR_SQ_BRACKET);
      }
    } catch (re) {
      if (re instanceof RecognitionException) {
        _localctx.exception = re;
        this._errHandler.reportError(this, re);
        this._errHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return _localctx;
  }

  /** Evaluate semantic predicates for precedence climbing in recursive rules */
  public sempred(_localctx: RuleContext, ruleIndex: number, predIndex: number): boolean {
    switch (ruleIndex) {
      case 5:
        return this.expression_sempred(_localctx as ExpressionContext, predIndex);
    }
    return true;
  }
  /** Semantic predicates for expression precedence (AND has higher precedence than OR) */
  private expression_sempred(_localctx: ExpressionContext, predIndex: number): boolean {
    switch (predIndex) {
      case 0:
        return this.precpred(this._ctx, 4);

      case 1:
        return this.precpred(this._ctx, 3);
    }
    return true;
  }

  public static readonly _serializedATN: string =
    '\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03"}\x04\x02\t' +
    "\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07\t" +
    "\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04\x0E" +
    "\t\x0E\x03\x02\x05\x02\x1E\n\x02\x03\x02\x05\x02!\n\x02\x03\x02\x05\x02" +
    "$\n\x02\x03\x02\x05\x02'\n\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03" +
    "\x03\x04\x03\x04\x03\x04\x03\x05\x03\x05\x05\x053\n\x05\x03\x06\x03\x06" +
    "\x03\x06\x03\x06\x07\x069\n\x06\f\x06\x0E\x06<\v\x06\x03\x07\x03\x07\x03" +
    "\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03" +
    "\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03" +
    "\x07\x03\x07\x05\x07T\n\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03" +
    "\x07\x07\x07\\\n\x07\f\x07\x0E\x07_\v\x07\x03\b\x03\b\x03\b\x05\bd\n\b" +
    "\x03\t\x03\t\x05\th\n\t\x03\n\x03\n\x03\v\x03\v\x03\f\x03\f\x03\r\x03" +
    "\r\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x07\x0Ev\n\x0E\f\x0E\x0E\x0Ey\v\x0E" +
    "\x03\x0E\x03\x0E\x03\x0E\x02\x02\x03\f\x0F\x02\x02\x04\x02\x06\x02\b\x02" +
    "\n\x02\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x02" +
    "\x07\x03\x02\x1B\x1C\x03\x02\r\x12\x03\x02 !\x03\x02\x16\x17\x03\x02\x1D" +
    "\x1E\x02\x80\x02\x1D\x03\x02\x02\x02\x04*\x03\x02\x02\x02\x06-\x03\x02" +
    "\x02\x02\b0\x03\x02\x02\x02\n4\x03\x02\x02\x02\fS\x03\x02\x02\x02\x0E" +
    "c\x03\x02\x02\x02\x10g\x03\x02\x02\x02\x12i\x03\x02\x02\x02\x14k\x03\x02" +
    "\x02\x02\x16m\x03\x02\x02\x02\x18o\x03\x02\x02\x02\x1Aq\x03\x02\x02\x02" +
    "\x1C\x1E\x05\f\x07\x02\x1D\x1C\x03\x02\x02\x02\x1D\x1E\x03\x02\x02\x02" +
    "\x1E \x03\x02\x02\x02\x1F!\x05\n\x06\x02 \x1F\x03\x02\x02\x02 !\x03\x02" +
    '\x02\x02!#\x03\x02\x02\x02"$\x05\x04\x03\x02#"\x03\x02\x02\x02#$\x03' +
    "\x02\x02\x02$&\x03\x02\x02\x02%'\x05\x06\x04\x02&%\x03\x02\x02\x02&'" +
    "\x03\x02\x02\x02'(\x03\x02\x02\x02()\x07\x02\x02\x03)\x03\x03\x02\x02" +
    "\x02*+\x07\x18\x02\x02+,\x05\x18\r\x02,\x05\x03\x02\x02\x02-.\x07\x19" +
    "\x02\x02./\x05\x16\f\x02/\x07\x03\x02\x02\x0202\x05\x12\n\x0213\t\x02" +
    "\x02\x0221\x03\x02\x02\x0223\x03\x02\x02\x023\t\x03\x02\x02\x0245\x07" +
    "\x1A\x02\x025:\x05\b\x05\x0267\x07\x06\x02\x0279\x05\b\x05\x0286\x03\x02" +
    "\x02\x029<\x03\x02\x02\x02:8\x03\x02\x02\x02:;\x03\x02\x02\x02;\v\x03" +
    "\x02\x02\x02<:\x03\x02\x02\x02=>\b\x07\x01\x02>?\x05\x12\n\x02?@\x07\x13" +
    "\x02\x02@A\x05\x16\f\x02AT\x03\x02\x02\x02BC\x05\x12\n\x02CD\x07\x14\x02" +
    "\x02DE\x05\x1A\x0E\x02ET\x03\x02\x02\x02FG\x05\x12\n\x02GH\x07\x15\x02" +
    "\x02HI\x05\x16\f\x02IT\x03\x02\x02\x02JK\x05\x12\n\x02KL\t\x03\x02\x02" +
    "LM\x05\x0E\b\x02MT\x03\x02\x02\x02NO\x07\x04\x02\x02OP\x05\f\x07\x02P" +
    "Q\x07\x05\x02\x02QT\x03\x02\x02\x02RT\x05\x10\t\x02S=\x03\x02\x02\x02" +
    "SB\x03\x02\x02\x02SF\x03\x02\x02\x02SJ\x03\x02\x02\x02SN\x03\x02\x02\x02" +
    "SR\x03\x02\x02\x02T]\x03\x02\x02\x02UV\f\x06\x02\x02VW\x07\v\x02\x02W" +
    "\\\x05\f\x07\x07XY\f\x05\x02\x02YZ\x07\f\x02\x02Z\\\x05\f\x07\x06[U\x03" +
    "\x02\x02\x02[X\x03\x02\x02\x02\\_\x03\x02\x02\x02][\x03\x02\x02\x02]^" +
    "\x03\x02\x02\x02^\r\x03\x02\x02\x02_]\x03\x02\x02\x02`d\x05\x14\v\x02" +
    "ad\x05\x18\r\x02bd\x05\x16\f\x02c`\x03\x02\x02\x02ca\x03\x02\x02\x02c" +
    "b\x03\x02\x02\x02d\x0F\x03\x02\x02\x02eh\x05\x0E\b\x02fh\x05\x12\n\x02" +
    "ge\x03\x02\x02\x02gf\x03\x02\x02\x02h\x11\x03\x02\x02\x02ij\t\x04\x02" +
    "\x02j\x13\x03\x02\x02\x02kl\t\x05\x02\x02l\x15\x03\x02\x02\x02mn\t\x06" +
    "\x02\x02n\x17\x03\x02\x02\x02op\x07\x1F\x02\x02p\x19\x03\x02\x02\x02q" +
    "r\x07\t\x02\x02rw\x05\x0E\b\x02st\x07\x06\x02\x02tv\x05\x0E\b\x02us\x03" +
    "\x02\x02\x02vy\x03\x02\x02\x02wu\x03\x02\x02\x02wx\x03\x02\x02\x02xz\x03" +
    "\x02\x02\x02yw\x03\x02\x02\x02z{\x07\n\x02\x02{\x1B\x03\x02\x02\x02\x0E" +
    "\x1D #&2:S[]cgw";
  public static __ATN: ATN;
  /** Get the deserialized ATN, lazily initialized */
  public static get _ATN(): ATN {
    if (!WebdaQLParserParser.__ATN) {
      WebdaQLParserParser.__ATN = new ATNDeserializer().deserialize(
        Utils.toCharArray(WebdaQLParserParser._serializedATN)
      );
    }

    return WebdaQLParserParser.__ATN;
  }
}

/** Parse tree context for the top-level webdaql rule */
export class WebdaqlContext extends ParserRuleContext {
  /** Get the EOF terminal node */
  public EOF(): TerminalNode {
    return this.getToken(WebdaQLParserParser.EOF, 0);
  }
  /** Get the optional expression child */
  public expression(): ExpressionContext | undefined {
    return this.tryGetRuleContext(0, ExpressionContext);
  }
  /** Get the optional ORDER BY expression */
  public orderExpression(): OrderExpressionContext | undefined {
    return this.tryGetRuleContext(0, OrderExpressionContext);
  }
  /** Get the optional LIMIT expression */
  public limitExpression(): LimitExpressionContext | undefined {
    return this.tryGetRuleContext(0, LimitExpressionContext);
  }
  /** Get the optional OFFSET expression */
  public offsetExpression(): OffsetExpressionContext | undefined {
    return this.tryGetRuleContext(0, OffsetExpressionContext);
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_webdaql;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterWebdaql) {
      listener.enterWebdaql(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitWebdaql) {
      listener.exitWebdaql(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitWebdaql) {
      return visitor.visitWebdaql(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Parse tree context for a LIMIT clause */
export class LimitExpressionContext extends ParserRuleContext {
  /** Get the LIMIT token */
  public LIMIT(): TerminalNode {
    return this.getToken(WebdaQLParserParser.LIMIT, 0);
  }
  /** Get the integer literal child */
  public integerLiteral(): IntegerLiteralContext {
    return this.getRuleContext(0, IntegerLiteralContext);
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_limitExpression;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterLimitExpression) {
      listener.enterLimitExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitLimitExpression) {
      listener.exitLimitExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitLimitExpression) {
      return visitor.visitLimitExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Parse tree context for an OFFSET clause */
export class OffsetExpressionContext extends ParserRuleContext {
  /** Get the OFFSET token */
  public OFFSET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.OFFSET, 0);
  }
  /** Get the string literal child */
  public stringLiteral(): StringLiteralContext {
    return this.getRuleContext(0, StringLiteralContext);
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_offsetExpression;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterOffsetExpression) {
      listener.enterOffsetExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitOffsetExpression) {
      listener.exitOffsetExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitOffsetExpression) {
      return visitor.visitOffsetExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Parse tree context for a single ORDER BY field with optional direction */
export class OrderFieldExpressionContext extends ParserRuleContext {
  /** Get the identifier child */
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  /** Get the optional ASC token */
  public ASC(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.ASC, 0);
  }
  /** Get the optional DESC token */
  public DESC(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.DESC, 0);
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_orderFieldExpression;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterOrderFieldExpression) {
      listener.enterOrderFieldExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitOrderFieldExpression) {
      listener.exitOrderFieldExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitOrderFieldExpression) {
      return visitor.visitOrderFieldExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Parse tree context for an ORDER BY clause */
export class OrderExpressionContext extends ParserRuleContext {
  /** Get the ORDER BY token */
  public ORDER_BY(): TerminalNode {
    return this.getToken(WebdaQLParserParser.ORDER_BY, 0);
  }
  /** Get all orderFieldExpression children */
  public orderFieldExpression(): OrderFieldExpressionContext[];
  /** Get the orderFieldExpression child at index i */
  public orderFieldExpression(i: number): OrderFieldExpressionContext;
  /** Get one or all orderFieldExpression children */
  public orderFieldExpression(i?: number): OrderFieldExpressionContext | OrderFieldExpressionContext[] {
    if (i === undefined) {
      return this.getRuleContexts(OrderFieldExpressionContext);
    } else {
      return this.getRuleContext(i, OrderFieldExpressionContext);
    }
  }
  /** Get all COMMA tokens */
  public COMMA(): TerminalNode[];
  /** Get the COMMA token at index i */
  public COMMA(i: number): TerminalNode;
  /** Get one or all COMMA tokens */
  public COMMA(i?: number): TerminalNode | TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(WebdaQLParserParser.COMMA);
    } else {
      return this.getToken(WebdaQLParserParser.COMMA, i);
    }
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_orderExpression;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterOrderExpression) {
      listener.enterOrderExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitOrderExpression) {
      listener.exitOrderExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitOrderExpression) {
      return visitor.visitOrderExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Base parse tree context for filter expressions */
export class ExpressionContext extends ParserRuleContext {
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_expression;
  }
  /** Copy state from another ExpressionContext */
  public copyFrom(ctx: ExpressionContext): void {
    super.copyFrom(ctx);
  }
}
/** Parse tree context for a LIKE expression */
export class LikeExpressionContext extends ExpressionContext {
  /** Get the identifier child */
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  /** Get the LIKE token */
  public LIKE(): TerminalNode {
    return this.getToken(WebdaQLParserParser.LIKE, 0);
  }
  /** Get the string literal child */
  public stringLiteral(): StringLiteralContext {
    return this.getRuleContext(0, StringLiteralContext);
  }
  /** @inheritdoc */
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterLikeExpression) {
      listener.enterLikeExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitLikeExpression) {
      listener.exitLikeExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitLikeExpression) {
      return visitor.visitLikeExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for an IN expression */
export class InExpressionContext extends ExpressionContext {
  /** Get the identifier child */
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  /** Get the IN token */
  public IN(): TerminalNode {
    return this.getToken(WebdaQLParserParser.IN, 0);
  }
  /** Get the set expression child */
  public setExpression(): SetExpressionContext {
    return this.getRuleContext(0, SetExpressionContext);
  }
  /** @inheritdoc */
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterInExpression) {
      listener.enterInExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitInExpression) {
      listener.exitInExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitInExpression) {
      return visitor.visitInExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for a CONTAINS expression */
export class ContainsExpressionContext extends ExpressionContext {
  /** Get the identifier child */
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  /** Get the CONTAINS token */
  public CONTAINS(): TerminalNode {
    return this.getToken(WebdaQLParserParser.CONTAINS, 0);
  }
  /** Get the string literal child */
  public stringLiteral(): StringLiteralContext {
    return this.getRuleContext(0, StringLiteralContext);
  }
  /** @inheritdoc */
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterContainsExpression) {
      listener.enterContainsExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitContainsExpression) {
      listener.exitContainsExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitContainsExpression) {
      return visitor.visitContainsExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for a binary comparison (=, !=, <, <=, >, >=) */
export class BinaryComparisonExpressionContext extends ExpressionContext {
  /** Get the identifier child */
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  /** Get the values child */
  public values(): ValuesContext {
    return this.getRuleContext(0, ValuesContext);
  }
  /** Get the optional = token */
  public EQUAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.EQUAL, 0);
  }
  /** Get the optional != token */
  public NOT_EQUAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.NOT_EQUAL, 0);
  }
  /** Get the optional >= token */
  public GREATER_OR_EQUAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.GREATER_OR_EQUAL, 0);
  }
  /** Get the optional <= token */
  public LESS_OR_EQUAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.LESS_OR_EQUAL, 0);
  }
  /** Get the optional < token */
  public LESS(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.LESS, 0);
  }
  /** Get the optional > token */
  public GREATER(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.GREATER, 0);
  }
  /** @inheritdoc */
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterBinaryComparisonExpression) {
      listener.enterBinaryComparisonExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitBinaryComparisonExpression) {
      listener.exitBinaryComparisonExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitBinaryComparisonExpression) {
      return visitor.visitBinaryComparisonExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for an AND logical expression */
export class AndLogicExpressionContext extends ExpressionContext {
  /** Get all expression children */
  public expression(): ExpressionContext[];
  /** Get the expression child at index i */
  public expression(i: number): ExpressionContext;
  /** Get one or all expression children */
  public expression(i?: number): ExpressionContext | ExpressionContext[] {
    if (i === undefined) {
      return this.getRuleContexts(ExpressionContext);
    } else {
      return this.getRuleContext(i, ExpressionContext);
    }
  }
  /** Get the AND token */
  public AND(): TerminalNode {
    return this.getToken(WebdaQLParserParser.AND, 0);
  }
  /** @inheritdoc */
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterAndLogicExpression) {
      listener.enterAndLogicExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitAndLogicExpression) {
      listener.exitAndLogicExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitAndLogicExpression) {
      return visitor.visitAndLogicExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for an OR logical expression */
export class OrLogicExpressionContext extends ExpressionContext {
  /** Get all expression children */
  public expression(): ExpressionContext[];
  /** Get the expression child at index i */
  public expression(i: number): ExpressionContext;
  /** Get one or all expression children */
  public expression(i?: number): ExpressionContext | ExpressionContext[] {
    if (i === undefined) {
      return this.getRuleContexts(ExpressionContext);
    } else {
      return this.getRuleContext(i, ExpressionContext);
    }
  }
  /** Get the OR token */
  public OR(): TerminalNode {
    return this.getToken(WebdaQLParserParser.OR, 0);
  }
  /** @inheritdoc */
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterOrLogicExpression) {
      listener.enterOrLogicExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitOrLogicExpression) {
      listener.exitOrLogicExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitOrLogicExpression) {
      return visitor.visitOrLogicExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for a parenthesized sub-expression */
export class SubExpressionContext extends ExpressionContext {
  /** Get the left bracket token */
  public LR_BRACKET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.LR_BRACKET, 0);
  }
  /** Get the inner expression */
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext);
  }
  /** Get the right bracket token */
  public RR_BRACKET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.RR_BRACKET, 0);
  }
  /** @inheritdoc */
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterSubExpression) {
      listener.enterSubExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitSubExpression) {
      listener.exitSubExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitSubExpression) {
      return visitor.visitSubExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for a standalone atom expression */
export class AtomExpressionContext extends ExpressionContext {
  /** Get the atom child */
  public atom(): AtomContext {
    return this.getRuleContext(0, AtomContext);
  }
  /** @inheritdoc */
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterAtomExpression) {
      listener.enterAtomExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitAtomExpression) {
      listener.exitAtomExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitAtomExpression) {
      return visitor.visitAtomExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Base parse tree context for value literals */
export class ValuesContext extends ParserRuleContext {
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_values;
  }
  /** Copy state from another ValuesContext */
  public copyFrom(ctx: ValuesContext): void {
    super.copyFrom(ctx);
  }
}
/** Parse tree context for a boolean value atom */
export class BooleanAtomContext extends ValuesContext {
  /** Get the boolean literal child */
  public booleanLiteral(): BooleanLiteralContext {
    return this.getRuleContext(0, BooleanLiteralContext);
  }
  /** @inheritdoc */
  constructor(ctx: ValuesContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterBooleanAtom) {
      listener.enterBooleanAtom(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitBooleanAtom) {
      listener.exitBooleanAtom(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitBooleanAtom) {
      return visitor.visitBooleanAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for an integer value atom */
export class IntegerAtomContext extends ValuesContext {
  /** Get the integer literal child */
  public integerLiteral(): IntegerLiteralContext {
    return this.getRuleContext(0, IntegerLiteralContext);
  }
  /** @inheritdoc */
  constructor(ctx: ValuesContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIntegerAtom) {
      listener.enterIntegerAtom(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIntegerAtom) {
      listener.exitIntegerAtom(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIntegerAtom) {
      return visitor.visitIntegerAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for a string value atom */
export class StringAtomContext extends ValuesContext {
  /** Get the string literal child */
  public stringLiteral(): StringLiteralContext {
    return this.getRuleContext(0, StringLiteralContext);
  }
  /** @inheritdoc */
  constructor(ctx: ValuesContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterStringAtom) {
      listener.enterStringAtom(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitStringAtom) {
      listener.exitStringAtom(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitStringAtom) {
      return visitor.visitStringAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Base parse tree context for atoms (values or identifiers) */
export class AtomContext extends ParserRuleContext {
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_atom;
  }
  /** Copy state from another AtomContext */
  public copyFrom(ctx: AtomContext): void {
    super.copyFrom(ctx);
  }
}
/** Parse tree context for a values-based atom */
export class ValuesAtomContext extends AtomContext {
  /** Get the values child */
  public values(): ValuesContext {
    return this.getRuleContext(0, ValuesContext);
  }
  /** @inheritdoc */
  constructor(ctx: AtomContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterValuesAtom) {
      listener.enterValuesAtom(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitValuesAtom) {
      listener.exitValuesAtom(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitValuesAtom) {
      return visitor.visitValuesAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
/** Parse tree context for an identifier-based atom */
export class IdentifierAtomContext extends AtomContext {
  /** Get the identifier child */
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  /** @inheritdoc */
  constructor(ctx: AtomContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIdentifierAtom) {
      listener.enterIdentifierAtom(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIdentifierAtom) {
      listener.exitIdentifierAtom(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIdentifierAtom) {
      return visitor.visitIdentifierAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Parse tree context for an identifier (field name) */
export class IdentifierContext extends ParserRuleContext {
  /** Get the optional IDENTIFIER token */
  public IDENTIFIER(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.IDENTIFIER, 0);
  }
  /** Get the optional IDENTIFIER_WITH_NUMBER token */
  public IDENTIFIER_WITH_NUMBER(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.IDENTIFIER_WITH_NUMBER, 0);
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_identifier;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIdentifier) {
      listener.enterIdentifier(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIdentifier) {
      listener.exitIdentifier(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIdentifier) {
      return visitor.visitIdentifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Parse tree context for a boolean literal (TRUE/FALSE) */
export class BooleanLiteralContext extends ParserRuleContext {
  /** Get the optional TRUE token */
  public TRUE(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.TRUE, 0);
  }
  /** Get the optional FALSE token */
  public FALSE(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.FALSE, 0);
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_booleanLiteral;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterBooleanLiteral) {
      listener.enterBooleanLiteral(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitBooleanLiteral) {
      listener.exitBooleanLiteral(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitBooleanLiteral) {
      return visitor.visitBooleanLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Parse tree context for a string literal */
export class StringLiteralContext extends ParserRuleContext {
  /** Get the optional double-quoted string literal token */
  public DQUOTED_STRING_LITERAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.DQUOTED_STRING_LITERAL, 0);
  }
  /** Get the optional single-quoted string literal token */
  public SQUOTED_STRING_LITERAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.SQUOTED_STRING_LITERAL, 0);
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_stringLiteral;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterStringLiteral) {
      listener.enterStringLiteral(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitStringLiteral) {
      listener.exitStringLiteral(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitStringLiteral) {
      return visitor.visitStringLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Parse tree context for an integer literal */
export class IntegerLiteralContext extends ParserRuleContext {
  /** Get the INTEGER_LITERAL token */
  public INTEGER_LITERAL(): TerminalNode {
    return this.getToken(WebdaQLParserParser.INTEGER_LITERAL, 0);
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_integerLiteral;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIntegerLiteral) {
      listener.enterIntegerLiteral(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIntegerLiteral) {
      listener.exitIntegerLiteral(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIntegerLiteral) {
      return visitor.visitIntegerLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

/** Parse tree context for a set expression ([value, ...]) */
export class SetExpressionContext extends ParserRuleContext {
  /** Get the left square bracket token */
  public LR_SQ_BRACKET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.LR_SQ_BRACKET, 0);
  }
  /** Get all values children */
  public values(): ValuesContext[];
  /** Get the values child at index i */
  public values(i: number): ValuesContext;
  /** Get one or all values children */
  public values(i?: number): ValuesContext | ValuesContext[] {
    if (i === undefined) {
      return this.getRuleContexts(ValuesContext);
    } else {
      return this.getRuleContext(i, ValuesContext);
    }
  }
  /** Get the right square bracket token */
  public RR_SQ_BRACKET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.RR_SQ_BRACKET, 0);
  }
  /** Get all COMMA tokens */
  public COMMA(): TerminalNode[];
  /** Get the COMMA token at index i */
  public COMMA(i: number): TerminalNode;
  /** Get one or all COMMA tokens */
  public COMMA(i?: number): TerminalNode | TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(WebdaQLParserParser.COMMA);
    } else {
      return this.getToken(WebdaQLParserParser.COMMA, i);
    }
  }
  /** @inheritdoc */
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  /** Get the rule index */
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_setExpression;
  }
  // @Override
  /** Notify the listener that we are entering this context */
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterSetExpression) {
      listener.enterSetExpression(this);
    }
  }
  // @Override
  /** Notify the listener that we are exiting this context */
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitSetExpression) {
      listener.exitSetExpression(this);
    }
  }
  // @Override
  /** Accept a visitor */
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitSetExpression) {
      return visitor.visitSetExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

// Generated from src/WebdaQLParser.g4 by ANTLR 4.9.0-SNAPSHOT

import { ATN } from "antlr4ts/atn/ATN.js";
import { ATNDeserializer } from "antlr4ts/atn/ATNDeserializer.js";
import { FailedPredicateException } from "antlr4ts/FailedPredicateException.js";
import { NotNull } from "antlr4ts/Decorators.js";
import { NoViableAltException } from "antlr4ts/NoViableAltException.js";
import { Override } from "antlr4ts/Decorators.js";
import { Parser } from "antlr4ts/Parser.js";
import { ParserRuleContext } from "antlr4ts/ParserRuleContext.js";
import { ParserATNSimulator } from "antlr4ts/atn/ParserATNSimulator.js";
import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener.js";
import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor.js";
import { RecognitionException } from "antlr4ts/RecognitionException.js";
import { RuleContext } from "antlr4ts/RuleContext.js";
//import { RuleVersion } from "antlr4ts/RuleVersion.js";
import { TerminalNode } from "antlr4ts/tree/TerminalNode.js";
import { Token } from "antlr4ts/Token.js";
import { TokenStream } from "antlr4ts/TokenStream.js";
import { Vocabulary } from "antlr4ts/Vocabulary.js";
import { VocabularyImpl } from "antlr4ts/VocabularyImpl.js";

import * as Utils from "antlr4ts/misc/Utils.js";

import { WebdaQLParserListener } from "./WebdaQLParserListener.js";
import { WebdaQLParserVisitor } from "./WebdaQLParserVisitor.js";

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
  public static readonly IS = 20;
  public static readonly NOT = 21;
  public static readonly NULL = 22;
  public static readonly TRUE = 23;
  public static readonly FALSE = 24;
  public static readonly LIMIT = 25;
  public static readonly OFFSET = 26;
  public static readonly ORDER_BY = 27;
  public static readonly ASC = 28;
  public static readonly DESC = 29;
  public static readonly DQUOTED_STRING_LITERAL = 30;
  public static readonly SQUOTED_STRING_LITERAL = 31;
  public static readonly INTEGER_LITERAL = 32;
  public static readonly NUMBER_LITERAL = 33;
  public static readonly POSITIONAL_PARAMETER = 34;
  public static readonly NAMED_PARAMETER = 35;
  public static readonly IDENTIFIER = 36;
  public static readonly IDENTIFIER_WITH_NUMBER = 37;
  public static readonly FUNCTION_IDENTIFIER_WITH_UNDERSCORE = 38;
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
  public static readonly RULE_numberLiteral = 12;
  public static readonly RULE_parameter = 13;
  public static readonly RULE_setExpression = 14;
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
    "numberLiteral",
    "parameter",
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
    "'IS'",
    "'NOT'",
    "'NULL'",
    "'TRUE'",
    "'FALSE'",
    "'LIMIT'",
    "'OFFSET'",
    "'ORDER BY'",
    "'ASC'",
    "'DESC'",
    undefined,
    undefined,
    undefined,
    undefined,
    "'?'"
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
    "IS",
    "NOT",
    "NULL",
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
    "NUMBER_LITERAL",
    "POSITIONAL_PARAMETER",
    "NAMED_PARAMETER",
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
  public get vocabulary(): Vocabulary {
    return WebdaQLParserParser.VOCABULARY;
  }
  // tslint:enable:no-trailing-whitespace

  // @Override
  public get grammarFileName(): string {
    return "WebdaQLParser.g4";
  }

  // @Override
  public get ruleNames(): string[] {
    return WebdaQLParserParser.ruleNames;
  }

  // @Override
  public get serializedATN(): string {
    return WebdaQLParserParser._serializedATN;
  }

  protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException {
    return new FailedPredicateException(this, predicate, message);
  }

  constructor(input: TokenStream) {
    super(input);
    this._interp = new ParserATNSimulator(WebdaQLParserParser._ATN, this);
  }
  // @RuleVersion(0)
  public webdaql(): WebdaqlContext {
    let _localctx: WebdaqlContext = new WebdaqlContext(this._ctx, this.state);
    this.enterRule(_localctx, 0, WebdaQLParserParser.RULE_webdaql);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 31;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (
          ((_la & ~0x1f) === 0 &&
            ((1 << _la) &
              ((1 << WebdaQLParserParser.LR_BRACKET) |
                (1 << WebdaQLParserParser.TRUE) |
                (1 << WebdaQLParserParser.FALSE) |
                (1 << WebdaQLParserParser.DQUOTED_STRING_LITERAL) |
                (1 << WebdaQLParserParser.SQUOTED_STRING_LITERAL))) !==
              0) ||
          (((_la - 32) & ~0x1f) === 0 &&
            ((1 << (_la - 32)) &
              ((1 << (WebdaQLParserParser.INTEGER_LITERAL - 32)) |
                (1 << (WebdaQLParserParser.NUMBER_LITERAL - 32)) |
                (1 << (WebdaQLParserParser.IDENTIFIER - 32)) |
                (1 << (WebdaQLParserParser.IDENTIFIER_WITH_NUMBER - 32)))) !==
              0)
        ) {
          {
            this.state = 30;
            this.expression(0);
          }
        }

        this.state = 34;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.ORDER_BY) {
          {
            this.state = 33;
            this.orderExpression();
          }
        }

        this.state = 37;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.LIMIT) {
          {
            this.state = 36;
            this.limitExpression();
          }
        }

        this.state = 40;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.OFFSET) {
          {
            this.state = 39;
            this.offsetExpression();
          }
        }

        this.state = 42;
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
  public limitExpression(): LimitExpressionContext {
    let _localctx: LimitExpressionContext = new LimitExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 2, WebdaQLParserParser.RULE_limitExpression);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 44;
        this.match(WebdaQLParserParser.LIMIT);
        this.state = 47;
        this._errHandler.sync(this);
        switch (this._input.LA(1)) {
          case WebdaQLParserParser.INTEGER_LITERAL:
            {
              this.state = 45;
              this.integerLiteral();
            }
            break;
          case WebdaQLParserParser.POSITIONAL_PARAMETER:
          case WebdaQLParserParser.NAMED_PARAMETER:
            {
              this.state = 46;
              this.parameter();
            }
            break;
          default:
            throw new NoViableAltException(this);
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
  public offsetExpression(): OffsetExpressionContext {
    let _localctx: OffsetExpressionContext = new OffsetExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 4, WebdaQLParserParser.RULE_offsetExpression);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 49;
        this.match(WebdaQLParserParser.OFFSET);
        this.state = 52;
        this._errHandler.sync(this);
        switch (this._input.LA(1)) {
          case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
            {
              this.state = 50;
              this.stringLiteral();
            }
            break;
          case WebdaQLParserParser.POSITIONAL_PARAMETER:
          case WebdaQLParserParser.NAMED_PARAMETER:
            {
              this.state = 51;
              this.parameter();
            }
            break;
          default:
            throw new NoViableAltException(this);
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
  public orderFieldExpression(): OrderFieldExpressionContext {
    let _localctx: OrderFieldExpressionContext = new OrderFieldExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 6, WebdaQLParserParser.RULE_orderFieldExpression);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 54;
        this.identifier();
        this.state = 56;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.ASC || _la === WebdaQLParserParser.DESC) {
          {
            this.state = 55;
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
  public orderExpression(): OrderExpressionContext {
    let _localctx: OrderExpressionContext = new OrderExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 8, WebdaQLParserParser.RULE_orderExpression);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 58;
        this.match(WebdaQLParserParser.ORDER_BY);
        this.state = 59;
        this.orderFieldExpression();
        this.state = 64;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while (_la === WebdaQLParserParser.COMMA) {
          {
            {
              this.state = 60;
              this.match(WebdaQLParserParser.COMMA);
              this.state = 61;
              this.orderFieldExpression();
            }
          }
          this.state = 66;
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

  public expression(): ExpressionContext;
  public expression(_p: number): ExpressionContext;
  // @RuleVersion(0)
  public expression(_p?: number): ExpressionContext {
    if (_p === undefined) {
      _p = 0;
    }

    let _parentctx: ParserRuleContext = this._ctx;
    let _parentState: number = this.state;
    let _localctx: ExpressionContext = new ExpressionContext(this._ctx, _parentState);
    let _prevctx: ExpressionContext = _localctx;
    let _startState: number = 10;
    this.enterRecursionRule(_localctx, 10, WebdaQLParserParser.RULE_expression, _p);
    let _la: number;
    try {
      let _alt: number;
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 106;
        this._errHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this._input, 12, this._ctx)) {
          case 1:
            {
              _localctx = new LikeExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;

              this.state = 68;
              this.identifier();
              this.state = 69;
              this.match(WebdaQLParserParser.LIKE);
              this.state = 72;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
                  {
                    this.state = 70;
                    this.stringLiteral();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 71;
                    this.parameter();
                  }
                  break;
                default:
                  throw new NoViableAltException(this);
              }
            }
            break;

          case 2:
            {
              _localctx = new InExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 74;
              this.identifier();
              this.state = 75;
              this.match(WebdaQLParserParser.IN);
              this.state = 78;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.LR_SQ_BRACKET:
                  {
                    this.state = 76;
                    this.setExpression();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 77;
                    this.parameter();
                  }
                  break;
                default:
                  throw new NoViableAltException(this);
              }
            }
            break;

          case 3:
            {
              _localctx = new ContainsExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 80;
              this.identifier();
              this.state = 81;
              this.match(WebdaQLParserParser.CONTAINS);
              this.state = 84;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
                  {
                    this.state = 82;
                    this.stringLiteral();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 83;
                    this.parameter();
                  }
                  break;
                default:
                  throw new NoViableAltException(this);
              }
            }
            break;

          case 4:
            {
              _localctx = new IsNullExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 86;
              this.identifier();
              this.state = 87;
              this.match(WebdaQLParserParser.IS);
              this.state = 88;
              this.match(WebdaQLParserParser.NULL);
            }
            break;

          case 5:
            {
              _localctx = new IsNotNullExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 90;
              this.identifier();
              this.state = 91;
              this.match(WebdaQLParserParser.IS);
              this.state = 92;
              this.match(WebdaQLParserParser.NOT);
              this.state = 93;
              this.match(WebdaQLParserParser.NULL);
            }
            break;

          case 6:
            {
              _localctx = new BinaryComparisonExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 95;
              this.identifier();
              this.state = 96;
              _la = this._input.LA(1);
              if (!(
                (_la & ~0x1f) === 0 &&
                ((1 << _la) &
                  ((1 << WebdaQLParserParser.EQUAL) |
                    (1 << WebdaQLParserParser.NOT_EQUAL) |
                    (1 << WebdaQLParserParser.GREATER) |
                    (1 << WebdaQLParserParser.GREATER_OR_EQUAL) |
                    (1 << WebdaQLParserParser.LESS) |
                    (1 << WebdaQLParserParser.LESS_OR_EQUAL))) !==
                  0
              )) {
                this._errHandler.recoverInline(this);
              } else {
                if (this._input.LA(1) === Token.EOF) {
                  this.matchedEOF = true;
                }

                this._errHandler.reportMatch(this);
                this.consume();
              }
              this.state = 99;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.TRUE:
                case WebdaQLParserParser.FALSE:
                case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.INTEGER_LITERAL:
                case WebdaQLParserParser.NUMBER_LITERAL:
                  {
                    this.state = 97;
                    this.values();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 98;
                    this.parameter();
                  }
                  break;
                default:
                  throw new NoViableAltException(this);
              }
            }
            break;

          case 7:
            {
              _localctx = new SubExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 101;
              this.match(WebdaQLParserParser.LR_BRACKET);
              this.state = 102;
              this.expression(0);
              this.state = 103;
              this.match(WebdaQLParserParser.RR_BRACKET);
            }
            break;

          case 8:
            {
              _localctx = new AtomExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 105;
              this.atom();
            }
            break;
        }
        this._ctx._stop = this._input.tryLT(-1);
        this.state = 116;
        this._errHandler.sync(this);
        _alt = this.interpreter.adaptivePredict(this._input, 14, this._ctx);
        while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
          if (_alt === 1) {
            if (this._parseListeners != null) {
              this.triggerExitRuleEvent();
            }
            _prevctx = _localctx;
            {
              this.state = 114;
              this._errHandler.sync(this);
              switch (this.interpreter.adaptivePredict(this._input, 13, this._ctx)) {
                case 1:
                  {
                    _localctx = new AndLogicExpressionContext(new ExpressionContext(_parentctx, _parentState));
                    this.pushNewRecursionContext(_localctx, _startState, WebdaQLParserParser.RULE_expression);
                    this.state = 108;
                    if (!this.precpred(this._ctx, 4)) {
                      throw this.createFailedPredicateException("this.precpred(this._ctx, 4)");
                    }
                    this.state = 109;
                    this.match(WebdaQLParserParser.AND);
                    this.state = 110;
                    this.expression(5);
                  }
                  break;

                case 2:
                  {
                    _localctx = new OrLogicExpressionContext(new ExpressionContext(_parentctx, _parentState));
                    this.pushNewRecursionContext(_localctx, _startState, WebdaQLParserParser.RULE_expression);
                    this.state = 111;
                    if (!this.precpred(this._ctx, 3)) {
                      throw this.createFailedPredicateException("this.precpred(this._ctx, 3)");
                    }
                    this.state = 112;
                    this.match(WebdaQLParserParser.OR);
                    this.state = 113;
                    this.expression(4);
                  }
                  break;
              }
            }
          }
          this.state = 118;
          this._errHandler.sync(this);
          _alt = this.interpreter.adaptivePredict(this._input, 14, this._ctx);
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
  public values(): ValuesContext {
    let _localctx: ValuesContext = new ValuesContext(this._ctx, this.state);
    this.enterRule(_localctx, 12, WebdaQLParserParser.RULE_values);
    try {
      this.state = 123;
      this._errHandler.sync(this);
      switch (this._input.LA(1)) {
        case WebdaQLParserParser.TRUE:
        case WebdaQLParserParser.FALSE:
          _localctx = new BooleanAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 1);
          {
            this.state = 119;
            this.booleanLiteral();
          }
          break;
        case WebdaQLParserParser.INTEGER_LITERAL:
          _localctx = new IntegerAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 2);
          {
            this.state = 120;
            this.integerLiteral();
          }
          break;
        case WebdaQLParserParser.NUMBER_LITERAL:
          _localctx = new NumberAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 3);
          {
            this.state = 121;
            this.numberLiteral();
          }
          break;
        case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
        case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
          _localctx = new StringAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 4);
          {
            this.state = 122;
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
  public atom(): AtomContext {
    let _localctx: AtomContext = new AtomContext(this._ctx, this.state);
    this.enterRule(_localctx, 14, WebdaQLParserParser.RULE_atom);
    try {
      this.state = 127;
      this._errHandler.sync(this);
      switch (this._input.LA(1)) {
        case WebdaQLParserParser.TRUE:
        case WebdaQLParserParser.FALSE:
        case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
        case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
        case WebdaQLParserParser.INTEGER_LITERAL:
        case WebdaQLParserParser.NUMBER_LITERAL:
          _localctx = new ValuesAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 1);
          {
            this.state = 125;
            this.values();
          }
          break;
        case WebdaQLParserParser.IDENTIFIER:
        case WebdaQLParserParser.IDENTIFIER_WITH_NUMBER:
          _localctx = new IdentifierAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 2);
          {
            this.state = 126;
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
  public identifier(): IdentifierContext {
    let _localctx: IdentifierContext = new IdentifierContext(this._ctx, this.state);
    this.enterRule(_localctx, 16, WebdaQLParserParser.RULE_identifier);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 129;
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
  public booleanLiteral(): BooleanLiteralContext {
    let _localctx: BooleanLiteralContext = new BooleanLiteralContext(this._ctx, this.state);
    this.enterRule(_localctx, 18, WebdaQLParserParser.RULE_booleanLiteral);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 131;
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
  public stringLiteral(): StringLiteralContext {
    let _localctx: StringLiteralContext = new StringLiteralContext(this._ctx, this.state);
    this.enterRule(_localctx, 20, WebdaQLParserParser.RULE_stringLiteral);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 133;
        _la = this._input.LA(1);
        if (!(
          _la === WebdaQLParserParser.DQUOTED_STRING_LITERAL || _la === WebdaQLParserParser.SQUOTED_STRING_LITERAL
        )) {
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
  public integerLiteral(): IntegerLiteralContext {
    let _localctx: IntegerLiteralContext = new IntegerLiteralContext(this._ctx, this.state);
    this.enterRule(_localctx, 22, WebdaQLParserParser.RULE_integerLiteral);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 135;
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
  public numberLiteral(): NumberLiteralContext {
    let _localctx: NumberLiteralContext = new NumberLiteralContext(this._ctx, this.state);
    this.enterRule(_localctx, 24, WebdaQLParserParser.RULE_numberLiteral);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 137;
        this.match(WebdaQLParserParser.NUMBER_LITERAL);
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
  public parameter(): ParameterContext {
    let _localctx: ParameterContext = new ParameterContext(this._ctx, this.state);
    this.enterRule(_localctx, 26, WebdaQLParserParser.RULE_parameter);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 139;
        _la = this._input.LA(1);
        if (!(_la === WebdaQLParserParser.POSITIONAL_PARAMETER || _la === WebdaQLParserParser.NAMED_PARAMETER)) {
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
  public setExpression(): SetExpressionContext {
    let _localctx: SetExpressionContext = new SetExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 28, WebdaQLParserParser.RULE_setExpression);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 141;
        this.match(WebdaQLParserParser.LR_SQ_BRACKET);
        this.state = 144;
        this._errHandler.sync(this);
        switch (this._input.LA(1)) {
          case WebdaQLParserParser.TRUE:
          case WebdaQLParserParser.FALSE:
          case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.INTEGER_LITERAL:
          case WebdaQLParserParser.NUMBER_LITERAL:
            {
              this.state = 142;
              this.values();
            }
            break;
          case WebdaQLParserParser.POSITIONAL_PARAMETER:
          case WebdaQLParserParser.NAMED_PARAMETER:
            {
              this.state = 143;
              this.parameter();
            }
            break;
          default:
            throw new NoViableAltException(this);
        }
        this.state = 153;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while (_la === WebdaQLParserParser.COMMA) {
          {
            {
              this.state = 146;
              this.match(WebdaQLParserParser.COMMA);
              this.state = 149;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.TRUE:
                case WebdaQLParserParser.FALSE:
                case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.INTEGER_LITERAL:
                case WebdaQLParserParser.NUMBER_LITERAL:
                  {
                    this.state = 147;
                    this.values();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 148;
                    this.parameter();
                  }
                  break;
                default:
                  throw new NoViableAltException(this);
              }
            }
          }
          this.state = 155;
          this._errHandler.sync(this);
          _la = this._input.LA(1);
        }
        this.state = 156;
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

  public sempred(_localctx: RuleContext, ruleIndex: number, predIndex: number): boolean {
    switch (ruleIndex) {
      case 5:
        return this.expression_sempred(_localctx as ExpressionContext, predIndex);
    }
    return true;
  }
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
    "\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03(\xA1\x04\x02" +
    "\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
    "\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
    '\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x03\x02\x05\x02"\n\x02\x03\x02' +
    "\x05\x02%\n\x02\x03\x02\x05\x02(\n\x02\x03\x02\x05\x02+\n\x02\x03\x02" +
    "\x03\x02\x03\x03\x03\x03\x03\x03\x05\x032\n\x03\x03\x04\x03\x04\x03\x04" +
    "\x05\x047\n\x04\x03\x05\x03\x05\x05\x05;\n\x05\x03\x06\x03\x06\x03\x06" +
    "\x03\x06\x07\x06A\n\x06\f\x06\x0E\x06D\v\x06\x03\x07\x03\x07\x03\x07\x03" +
    "\x07\x03\x07\x05\x07K\n\x07\x03\x07\x03\x07\x03\x07\x03\x07\x05\x07Q\n" +
    "\x07\x03\x07\x03\x07\x03\x07\x03\x07\x05\x07W\n\x07\x03\x07\x03\x07\x03" +
    "\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03" +
    "\x07\x03\x07\x05\x07f\n\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x05" +
    "\x07m\n\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x07\x07u\n" +
    "\x07\f\x07\x0E\x07x\v\x07\x03\b\x03\b\x03\b\x03\b\x05\b~\n\b\x03\t\x03" +
    "\t\x05\t\x82\n\t\x03\n\x03\n\x03\v\x03\v\x03\f\x03\f\x03\r\x03\r\x03\x0E" +
    "\x03\x0E\x03\x0F\x03\x0F\x03\x10\x03\x10\x03\x10\x05\x10\x93\n\x10\x03" +
    "\x10\x03\x10\x03\x10\x05\x10\x98\n\x10\x07\x10\x9A\n\x10\f\x10\x0E\x10" +
    "\x9D\v\x10\x03\x10\x03\x10\x03\x10\x02\x02\x03\f\x11\x02\x02\x04\x02\x06" +
    "\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02" +
    "\x1A\x02\x1C\x02\x1E\x02\x02\b\x03\x02\x1E\x1F\x03\x02\r\x12\x03\x02&" +
    "\'\x03\x02\x19\x1A\x03\x02 !\x03\x02$%\x02\xAD\x02!\x03\x02\x02\x02\x04" +
    ".\x03\x02\x02\x02\x063\x03\x02\x02\x02\b8\x03\x02\x02\x02\n<\x03\x02\x02" +
    "\x02\fl\x03\x02\x02\x02\x0E}\x03\x02\x02\x02\x10\x81\x03\x02\x02\x02\x12" +
    "\x83\x03\x02\x02\x02\x14\x85\x03\x02\x02\x02\x16\x87\x03\x02\x02\x02\x18" +
    "\x89\x03\x02\x02\x02\x1A\x8B\x03\x02\x02\x02\x1C\x8D\x03\x02\x02\x02\x1E" +
    '\x8F\x03\x02\x02\x02 "\x05\f\x07\x02! \x03\x02\x02\x02!"\x03\x02\x02' +
    '\x02"$\x03\x02\x02\x02#%\x05\n\x06\x02$#\x03\x02\x02\x02$%\x03\x02\x02' +
    "\x02%\'\x03\x02\x02\x02&(\x05\x04\x03\x02\'&\x03\x02\x02\x02\'(\x03\x02" +
    "\x02\x02(*\x03\x02\x02\x02)+\x05\x06\x04\x02*)\x03\x02\x02\x02*+\x03\x02" +
    "\x02\x02+,\x03\x02\x02\x02,-\x07\x02\x02\x03-\x03\x03\x02\x02\x02.1\x07" +
    "\x1B\x02\x02/2\x05\x18\r\x0202\x05\x1C\x0F\x021/\x03\x02\x02\x0210\x03" +
    "\x02\x02\x022\x05\x03\x02\x02\x0236\x07\x1C\x02\x0247\x05\x16\f\x0257" +
    "\x05\x1C\x0F\x0264\x03\x02\x02\x0265\x03\x02\x02\x027\x07\x03\x02\x02" +
    "\x028:\x05\x12\n\x029;\t\x02\x02\x02:9\x03\x02\x02\x02:;\x03\x02\x02\x02" +
    ";\t\x03\x02\x02\x02<=\x07\x1D\x02\x02=B\x05\b\x05\x02>?\x07\x06\x02\x02" +
    "?A\x05\b\x05\x02@>\x03\x02\x02\x02AD\x03\x02\x02\x02B@\x03\x02\x02\x02" +
    "BC\x03\x02\x02\x02C\v\x03\x02\x02\x02DB\x03\x02\x02\x02EF\b\x07\x01\x02" +
    "FG\x05\x12\n\x02GJ\x07\x13\x02\x02HK\x05\x16\f\x02IK\x05\x1C\x0F\x02J" +
    "H\x03\x02\x02\x02JI\x03\x02\x02\x02Km\x03\x02\x02\x02LM\x05\x12\n\x02" +
    "MP\x07\x14\x02\x02NQ\x05\x1E\x10\x02OQ\x05\x1C\x0F\x02PN\x03\x02\x02\x02" +
    "PO\x03\x02\x02\x02Qm\x03\x02\x02\x02RS\x05\x12\n\x02SV\x07\x15\x02\x02" +
    "TW\x05\x16\f\x02UW\x05\x1C\x0F\x02VT\x03\x02\x02\x02VU\x03\x02\x02\x02" +
    "Wm\x03\x02\x02\x02XY\x05\x12\n\x02YZ\x07\x16\x02\x02Z[\x07\x18\x02\x02" +
    "[m\x03\x02\x02\x02\\]\x05\x12\n\x02]^\x07\x16\x02\x02^_\x07\x17\x02\x02" +
    "_`\x07\x18\x02\x02`m\x03\x02\x02\x02ab\x05\x12\n\x02be\t\x03\x02\x02c" +
    "f\x05\x0E\b\x02df\x05\x1C\x0F\x02ec\x03\x02\x02\x02ed\x03\x02\x02\x02" +
    "fm\x03\x02\x02\x02gh\x07\x04\x02\x02hi\x05\f\x07\x02ij\x07\x05\x02\x02" +
    "jm\x03\x02\x02\x02km\x05\x10\t\x02lE\x03\x02\x02\x02lL\x03\x02\x02\x02" +
    "lR\x03\x02\x02\x02lX\x03\x02\x02\x02l\\\x03\x02\x02\x02la\x03\x02\x02" +
    "\x02lg\x03\x02\x02\x02lk\x03\x02\x02\x02mv\x03\x02\x02\x02no\f\x06\x02" +
    "\x02op\x07\v\x02\x02pu\x05\f\x07\x07qr\f\x05\x02\x02rs\x07\f\x02\x02s" +
    "u\x05\f\x07\x06tn\x03\x02\x02\x02tq\x03\x02\x02\x02ux\x03\x02\x02\x02" +
    "vt\x03\x02\x02\x02vw\x03\x02\x02\x02w\r\x03\x02\x02\x02xv\x03\x02\x02" +
    "\x02y~\x05\x14\v\x02z~\x05\x18\r\x02{~\x05\x1A\x0E\x02|~\x05\x16\f\x02" +
    "}y\x03\x02\x02\x02}z\x03\x02\x02\x02}{\x03\x02\x02\x02}|\x03\x02\x02\x02" +
    "~\x0F\x03\x02\x02\x02\x7F\x82\x05\x0E\b\x02\x80\x82\x05\x12\n\x02\x81" +
    "\x7F\x03\x02\x02\x02\x81\x80\x03\x02\x02\x02\x82\x11\x03\x02\x02\x02\x83" +
    "\x84\t\x04\x02\x02\x84\x13\x03\x02\x02\x02\x85\x86\t\x05\x02\x02\x86\x15" +
    "\x03\x02\x02\x02\x87\x88\t\x06\x02\x02\x88\x17\x03\x02\x02\x02\x89\x8A" +
    '\x07"\x02\x02\x8A\x19\x03\x02\x02\x02\x8B\x8C\x07#\x02\x02\x8C\x1B\x03' +
    "\x02\x02\x02\x8D\x8E\t\x07\x02\x02\x8E\x1D\x03\x02\x02\x02\x8F\x92\x07" +
    "\t\x02\x02\x90\x93\x05\x0E\b\x02\x91\x93\x05\x1C\x0F\x02\x92\x90\x03\x02" +
    "\x02\x02\x92\x91\x03\x02\x02\x02\x93\x9B\x03\x02\x02\x02\x94\x97\x07\x06" +
    "\x02\x02\x95\x98\x05\x0E\b\x02\x96\x98\x05\x1C\x0F\x02\x97\x95\x03\x02" +
    "\x02\x02\x97\x96\x03\x02\x02\x02\x98\x9A\x03\x02\x02\x02\x99\x94\x03\x02" +
    "\x02\x02\x9A\x9D\x03\x02\x02\x02\x9B\x99\x03\x02\x02\x02\x9B\x9C\x03\x02" +
    "\x02\x02\x9C\x9E\x03\x02\x02\x02\x9D\x9B\x03\x02\x02\x02\x9E\x9F\x07\n" +
    "\x02\x02\x9F\x1F\x03\x02\x02\x02\x16!$\'*16:BJPVeltv}\x81\x92\x97\x9B";
  public static __ATN: ATN;
  public static get _ATN(): ATN {
    if (!WebdaQLParserParser.__ATN) {
      WebdaQLParserParser.__ATN = new ATNDeserializer().deserialize(
        Utils.toCharArray(WebdaQLParserParser._serializedATN)
      );
    }

    return WebdaQLParserParser.__ATN;
  }
}

export class WebdaqlContext extends ParserRuleContext {
  public EOF(): TerminalNode {
    return this.getToken(WebdaQLParserParser.EOF, 0);
  }
  public expression(): ExpressionContext | undefined {
    return this.tryGetRuleContext(0, ExpressionContext);
  }
  public orderExpression(): OrderExpressionContext | undefined {
    return this.tryGetRuleContext(0, OrderExpressionContext);
  }
  public limitExpression(): LimitExpressionContext | undefined {
    return this.tryGetRuleContext(0, LimitExpressionContext);
  }
  public offsetExpression(): OffsetExpressionContext | undefined {
    return this.tryGetRuleContext(0, OffsetExpressionContext);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_webdaql;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterWebdaql) {
      listener.enterWebdaql(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitWebdaql) {
      listener.exitWebdaql(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitWebdaql) {
      return visitor.visitWebdaql(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LimitExpressionContext extends ParserRuleContext {
  public LIMIT(): TerminalNode {
    return this.getToken(WebdaQLParserParser.LIMIT, 0);
  }
  public integerLiteral(): IntegerLiteralContext | undefined {
    return this.tryGetRuleContext(0, IntegerLiteralContext);
  }
  public parameter(): ParameterContext | undefined {
    return this.tryGetRuleContext(0, ParameterContext);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_limitExpression;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterLimitExpression) {
      listener.enterLimitExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitLimitExpression) {
      listener.exitLimitExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitLimitExpression) {
      return visitor.visitLimitExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class OffsetExpressionContext extends ParserRuleContext {
  public OFFSET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.OFFSET, 0);
  }
  public stringLiteral(): StringLiteralContext | undefined {
    return this.tryGetRuleContext(0, StringLiteralContext);
  }
  public parameter(): ParameterContext | undefined {
    return this.tryGetRuleContext(0, ParameterContext);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_offsetExpression;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterOffsetExpression) {
      listener.enterOffsetExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitOffsetExpression) {
      listener.exitOffsetExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitOffsetExpression) {
      return visitor.visitOffsetExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class OrderFieldExpressionContext extends ParserRuleContext {
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  public ASC(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.ASC, 0);
  }
  public DESC(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.DESC, 0);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_orderFieldExpression;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterOrderFieldExpression) {
      listener.enterOrderFieldExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitOrderFieldExpression) {
      listener.exitOrderFieldExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitOrderFieldExpression) {
      return visitor.visitOrderFieldExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class OrderExpressionContext extends ParserRuleContext {
  public ORDER_BY(): TerminalNode {
    return this.getToken(WebdaQLParserParser.ORDER_BY, 0);
  }
  public orderFieldExpression(): OrderFieldExpressionContext[];
  public orderFieldExpression(i: number): OrderFieldExpressionContext;
  public orderFieldExpression(i?: number): OrderFieldExpressionContext | OrderFieldExpressionContext[] {
    if (i === undefined) {
      return this.getRuleContexts(OrderFieldExpressionContext);
    } else {
      return this.getRuleContext(i, OrderFieldExpressionContext);
    }
  }
  public COMMA(): TerminalNode[];
  public COMMA(i: number): TerminalNode;
  public COMMA(i?: number): TerminalNode | TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(WebdaQLParserParser.COMMA);
    } else {
      return this.getToken(WebdaQLParserParser.COMMA, i);
    }
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_orderExpression;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterOrderExpression) {
      listener.enterOrderExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitOrderExpression) {
      listener.exitOrderExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitOrderExpression) {
      return visitor.visitOrderExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ExpressionContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_expression;
  }
  public copyFrom(ctx: ExpressionContext): void {
    super.copyFrom(ctx);
  }
}
export class LikeExpressionContext extends ExpressionContext {
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  public LIKE(): TerminalNode {
    return this.getToken(WebdaQLParserParser.LIKE, 0);
  }
  public stringLiteral(): StringLiteralContext | undefined {
    return this.tryGetRuleContext(0, StringLiteralContext);
  }
  public parameter(): ParameterContext | undefined {
    return this.tryGetRuleContext(0, ParameterContext);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterLikeExpression) {
      listener.enterLikeExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitLikeExpression) {
      listener.exitLikeExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitLikeExpression) {
      return visitor.visitLikeExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class InExpressionContext extends ExpressionContext {
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  public IN(): TerminalNode {
    return this.getToken(WebdaQLParserParser.IN, 0);
  }
  public setExpression(): SetExpressionContext | undefined {
    return this.tryGetRuleContext(0, SetExpressionContext);
  }
  public parameter(): ParameterContext | undefined {
    return this.tryGetRuleContext(0, ParameterContext);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterInExpression) {
      listener.enterInExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitInExpression) {
      listener.exitInExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitInExpression) {
      return visitor.visitInExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class ContainsExpressionContext extends ExpressionContext {
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  public CONTAINS(): TerminalNode {
    return this.getToken(WebdaQLParserParser.CONTAINS, 0);
  }
  public stringLiteral(): StringLiteralContext | undefined {
    return this.tryGetRuleContext(0, StringLiteralContext);
  }
  public parameter(): ParameterContext | undefined {
    return this.tryGetRuleContext(0, ParameterContext);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterContainsExpression) {
      listener.enterContainsExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitContainsExpression) {
      listener.exitContainsExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitContainsExpression) {
      return visitor.visitContainsExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class IsNullExpressionContext extends ExpressionContext {
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  public IS(): TerminalNode {
    return this.getToken(WebdaQLParserParser.IS, 0);
  }
  public NULL(): TerminalNode {
    return this.getToken(WebdaQLParserParser.NULL, 0);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIsNullExpression) {
      listener.enterIsNullExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIsNullExpression) {
      listener.exitIsNullExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIsNullExpression) {
      return visitor.visitIsNullExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class IsNotNullExpressionContext extends ExpressionContext {
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  public IS(): TerminalNode {
    return this.getToken(WebdaQLParserParser.IS, 0);
  }
  public NOT(): TerminalNode {
    return this.getToken(WebdaQLParserParser.NOT, 0);
  }
  public NULL(): TerminalNode {
    return this.getToken(WebdaQLParserParser.NULL, 0);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIsNotNullExpression) {
      listener.enterIsNotNullExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIsNotNullExpression) {
      listener.exitIsNotNullExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIsNotNullExpression) {
      return visitor.visitIsNotNullExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class BinaryComparisonExpressionContext extends ExpressionContext {
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  public EQUAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.EQUAL, 0);
  }
  public NOT_EQUAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.NOT_EQUAL, 0);
  }
  public GREATER_OR_EQUAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.GREATER_OR_EQUAL, 0);
  }
  public LESS_OR_EQUAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.LESS_OR_EQUAL, 0);
  }
  public LESS(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.LESS, 0);
  }
  public GREATER(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.GREATER, 0);
  }
  public values(): ValuesContext | undefined {
    return this.tryGetRuleContext(0, ValuesContext);
  }
  public parameter(): ParameterContext | undefined {
    return this.tryGetRuleContext(0, ParameterContext);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterBinaryComparisonExpression) {
      listener.enterBinaryComparisonExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitBinaryComparisonExpression) {
      listener.exitBinaryComparisonExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitBinaryComparisonExpression) {
      return visitor.visitBinaryComparisonExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class AndLogicExpressionContext extends ExpressionContext {
  public expression(): ExpressionContext[];
  public expression(i: number): ExpressionContext;
  public expression(i?: number): ExpressionContext | ExpressionContext[] {
    if (i === undefined) {
      return this.getRuleContexts(ExpressionContext);
    } else {
      return this.getRuleContext(i, ExpressionContext);
    }
  }
  public AND(): TerminalNode {
    return this.getToken(WebdaQLParserParser.AND, 0);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterAndLogicExpression) {
      listener.enterAndLogicExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitAndLogicExpression) {
      listener.exitAndLogicExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitAndLogicExpression) {
      return visitor.visitAndLogicExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class OrLogicExpressionContext extends ExpressionContext {
  public expression(): ExpressionContext[];
  public expression(i: number): ExpressionContext;
  public expression(i?: number): ExpressionContext | ExpressionContext[] {
    if (i === undefined) {
      return this.getRuleContexts(ExpressionContext);
    } else {
      return this.getRuleContext(i, ExpressionContext);
    }
  }
  public OR(): TerminalNode {
    return this.getToken(WebdaQLParserParser.OR, 0);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterOrLogicExpression) {
      listener.enterOrLogicExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitOrLogicExpression) {
      listener.exitOrLogicExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitOrLogicExpression) {
      return visitor.visitOrLogicExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class SubExpressionContext extends ExpressionContext {
  public LR_BRACKET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.LR_BRACKET, 0);
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext);
  }
  public RR_BRACKET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.RR_BRACKET, 0);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterSubExpression) {
      listener.enterSubExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitSubExpression) {
      listener.exitSubExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitSubExpression) {
      return visitor.visitSubExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class AtomExpressionContext extends ExpressionContext {
  public atom(): AtomContext {
    return this.getRuleContext(0, AtomContext);
  }
  constructor(ctx: ExpressionContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterAtomExpression) {
      listener.enterAtomExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitAtomExpression) {
      listener.exitAtomExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitAtomExpression) {
      return visitor.visitAtomExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ValuesContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_values;
  }
  public copyFrom(ctx: ValuesContext): void {
    super.copyFrom(ctx);
  }
}
export class BooleanAtomContext extends ValuesContext {
  public booleanLiteral(): BooleanLiteralContext {
    return this.getRuleContext(0, BooleanLiteralContext);
  }
  constructor(ctx: ValuesContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterBooleanAtom) {
      listener.enterBooleanAtom(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitBooleanAtom) {
      listener.exitBooleanAtom(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitBooleanAtom) {
      return visitor.visitBooleanAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class IntegerAtomContext extends ValuesContext {
  public integerLiteral(): IntegerLiteralContext {
    return this.getRuleContext(0, IntegerLiteralContext);
  }
  constructor(ctx: ValuesContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIntegerAtom) {
      listener.enterIntegerAtom(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIntegerAtom) {
      listener.exitIntegerAtom(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIntegerAtom) {
      return visitor.visitIntegerAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class NumberAtomContext extends ValuesContext {
  public numberLiteral(): NumberLiteralContext {
    return this.getRuleContext(0, NumberLiteralContext);
  }
  constructor(ctx: ValuesContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterNumberAtom) {
      listener.enterNumberAtom(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitNumberAtom) {
      listener.exitNumberAtom(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitNumberAtom) {
      return visitor.visitNumberAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class StringAtomContext extends ValuesContext {
  public stringLiteral(): StringLiteralContext {
    return this.getRuleContext(0, StringLiteralContext);
  }
  constructor(ctx: ValuesContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterStringAtom) {
      listener.enterStringAtom(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitStringAtom) {
      listener.exitStringAtom(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitStringAtom) {
      return visitor.visitStringAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AtomContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_atom;
  }
  public copyFrom(ctx: AtomContext): void {
    super.copyFrom(ctx);
  }
}
export class ValuesAtomContext extends AtomContext {
  public values(): ValuesContext {
    return this.getRuleContext(0, ValuesContext);
  }
  constructor(ctx: AtomContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterValuesAtom) {
      listener.enterValuesAtom(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitValuesAtom) {
      listener.exitValuesAtom(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitValuesAtom) {
      return visitor.visitValuesAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
export class IdentifierAtomContext extends AtomContext {
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  constructor(ctx: AtomContext) {
    super(ctx.parent, ctx.invokingState);
    this.copyFrom(ctx);
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIdentifierAtom) {
      listener.enterIdentifierAtom(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIdentifierAtom) {
      listener.exitIdentifierAtom(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIdentifierAtom) {
      return visitor.visitIdentifierAtom(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class IdentifierContext extends ParserRuleContext {
  public IDENTIFIER(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.IDENTIFIER, 0);
  }
  public IDENTIFIER_WITH_NUMBER(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.IDENTIFIER_WITH_NUMBER, 0);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_identifier;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIdentifier) {
      listener.enterIdentifier(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIdentifier) {
      listener.exitIdentifier(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIdentifier) {
      return visitor.visitIdentifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class BooleanLiteralContext extends ParserRuleContext {
  public TRUE(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.TRUE, 0);
  }
  public FALSE(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.FALSE, 0);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_booleanLiteral;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterBooleanLiteral) {
      listener.enterBooleanLiteral(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitBooleanLiteral) {
      listener.exitBooleanLiteral(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitBooleanLiteral) {
      return visitor.visitBooleanLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class StringLiteralContext extends ParserRuleContext {
  public DQUOTED_STRING_LITERAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.DQUOTED_STRING_LITERAL, 0);
  }
  public SQUOTED_STRING_LITERAL(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.SQUOTED_STRING_LITERAL, 0);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_stringLiteral;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterStringLiteral) {
      listener.enterStringLiteral(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitStringLiteral) {
      listener.exitStringLiteral(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitStringLiteral) {
      return visitor.visitStringLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class IntegerLiteralContext extends ParserRuleContext {
  public INTEGER_LITERAL(): TerminalNode {
    return this.getToken(WebdaQLParserParser.INTEGER_LITERAL, 0);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_integerLiteral;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterIntegerLiteral) {
      listener.enterIntegerLiteral(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitIntegerLiteral) {
      listener.exitIntegerLiteral(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitIntegerLiteral) {
      return visitor.visitIntegerLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class NumberLiteralContext extends ParserRuleContext {
  public NUMBER_LITERAL(): TerminalNode {
    return this.getToken(WebdaQLParserParser.NUMBER_LITERAL, 0);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_numberLiteral;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterNumberLiteral) {
      listener.enterNumberLiteral(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitNumberLiteral) {
      listener.exitNumberLiteral(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitNumberLiteral) {
      return visitor.visitNumberLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParameterContext extends ParserRuleContext {
  public POSITIONAL_PARAMETER(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.POSITIONAL_PARAMETER, 0);
  }
  public NAMED_PARAMETER(): TerminalNode | undefined {
    return this.tryGetToken(WebdaQLParserParser.NAMED_PARAMETER, 0);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_parameter;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterParameter) {
      listener.enterParameter(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitParameter) {
      listener.exitParameter(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitParameter) {
      return visitor.visitParameter(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SetExpressionContext extends ParserRuleContext {
  public LR_SQ_BRACKET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.LR_SQ_BRACKET, 0);
  }
  public RR_SQ_BRACKET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.RR_SQ_BRACKET, 0);
  }
  public values(): ValuesContext[];
  public values(i: number): ValuesContext;
  public values(i?: number): ValuesContext | ValuesContext[] {
    if (i === undefined) {
      return this.getRuleContexts(ValuesContext);
    } else {
      return this.getRuleContext(i, ValuesContext);
    }
  }
  public parameter(): ParameterContext[];
  public parameter(i: number): ParameterContext;
  public parameter(i?: number): ParameterContext | ParameterContext[] {
    if (i === undefined) {
      return this.getRuleContexts(ParameterContext);
    } else {
      return this.getRuleContext(i, ParameterContext);
    }
  }
  public COMMA(): TerminalNode[];
  public COMMA(i: number): TerminalNode;
  public COMMA(i?: number): TerminalNode | TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(WebdaQLParserParser.COMMA);
    } else {
      return this.getToken(WebdaQLParserParser.COMMA, i);
    }
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_setExpression;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterSetExpression) {
      listener.enterSetExpression(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitSetExpression) {
      listener.exitSetExpression(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitSetExpression) {
      return visitor.visitSetExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

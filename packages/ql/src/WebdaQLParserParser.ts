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
  public static readonly DELETE = 9;
  public static readonly UPDATE = 10;
  public static readonly SELECT = 11;
  public static readonly SET = 12;
  public static readonly WHERE = 13;
  public static readonly AND = 14;
  public static readonly OR = 15;
  public static readonly EQUAL = 16;
  public static readonly NOT_EQUAL = 17;
  public static readonly GREATER = 18;
  public static readonly GREATER_OR_EQUAL = 19;
  public static readonly LESS = 20;
  public static readonly LESS_OR_EQUAL = 21;
  public static readonly LIKE = 22;
  public static readonly IN = 23;
  public static readonly CONTAINS = 24;
  public static readonly IS = 25;
  public static readonly NOT = 26;
  public static readonly NULL = 27;
  public static readonly TRUE = 28;
  public static readonly FALSE = 29;
  public static readonly LIMIT = 30;
  public static readonly OFFSET = 31;
  public static readonly ORDER_BY = 32;
  public static readonly ASC = 33;
  public static readonly DESC = 34;
  public static readonly DQUOTED_STRING_LITERAL = 35;
  public static readonly SQUOTED_STRING_LITERAL = 36;
  public static readonly INTEGER_LITERAL = 37;
  public static readonly NUMBER_LITERAL = 38;
  public static readonly POSITIONAL_PARAMETER = 39;
  public static readonly NAMED_PARAMETER = 40;
  public static readonly IDENTIFIER = 41;
  public static readonly IDENTIFIER_WITH_NUMBER = 42;
  public static readonly FUNCTION_IDENTIFIER_WITH_UNDERSCORE = 43;
  public static readonly RULE_webdaql = 0;
  public static readonly RULE_statement = 1;
  public static readonly RULE_deleteStatement = 2;
  public static readonly RULE_updateStatement = 3;
  public static readonly RULE_selectStatement = 4;
  public static readonly RULE_filterQuery = 5;
  public static readonly RULE_whereClause = 6;
  public static readonly RULE_assignmentList = 7;
  public static readonly RULE_assignment = 8;
  public static readonly RULE_fieldList = 9;
  public static readonly RULE_limitExpression = 10;
  public static readonly RULE_offsetExpression = 11;
  public static readonly RULE_orderFieldExpression = 12;
  public static readonly RULE_orderExpression = 13;
  public static readonly RULE_expression = 14;
  public static readonly RULE_values = 15;
  public static readonly RULE_atom = 16;
  public static readonly RULE_identifier = 17;
  public static readonly RULE_booleanLiteral = 18;
  public static readonly RULE_stringLiteral = 19;
  public static readonly RULE_integerLiteral = 20;
  public static readonly RULE_numberLiteral = 21;
  public static readonly RULE_parameter = 22;
  public static readonly RULE_setExpression = 23;
  // tslint:disable:no-trailing-whitespace
  public static readonly ruleNames: string[] = [
    "webdaql",
    "statement",
    "deleteStatement",
    "updateStatement",
    "selectStatement",
    "filterQuery",
    "whereClause",
    "assignmentList",
    "assignment",
    "fieldList",
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
    "'DELETE'",
    "'UPDATE'",
    "'SELECT'",
    "'SET'",
    "'WHERE'",
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
    "DELETE",
    "UPDATE",
    "SELECT",
    "SET",
    "WHERE",
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
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 50;
        this._errHandler.sync(this);
        switch (this._input.LA(1)) {
          case WebdaQLParserParser.DELETE:
          case WebdaQLParserParser.UPDATE:
          case WebdaQLParserParser.SELECT:
            {
              this.state = 48;
              this.statement();
            }
            break;
          case WebdaQLParserParser.EOF:
          case WebdaQLParserParser.LR_BRACKET:
          case WebdaQLParserParser.TRUE:
          case WebdaQLParserParser.FALSE:
          case WebdaQLParserParser.LIMIT:
          case WebdaQLParserParser.OFFSET:
          case WebdaQLParserParser.ORDER_BY:
          case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.INTEGER_LITERAL:
          case WebdaQLParserParser.NUMBER_LITERAL:
          case WebdaQLParserParser.IDENTIFIER:
          case WebdaQLParserParser.IDENTIFIER_WITH_NUMBER:
            {
              this.state = 49;
              this.filterQuery();
            }
            break;
          default:
            throw new NoViableAltException(this);
        }
        this.state = 52;
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
  public statement(): StatementContext {
    let _localctx: StatementContext = new StatementContext(this._ctx, this.state);
    this.enterRule(_localctx, 2, WebdaQLParserParser.RULE_statement);
    try {
      this.state = 57;
      this._errHandler.sync(this);
      switch (this._input.LA(1)) {
        case WebdaQLParserParser.DELETE:
          this.enterOuterAlt(_localctx, 1);
          {
            this.state = 54;
            this.deleteStatement();
          }
          break;
        case WebdaQLParserParser.UPDATE:
          this.enterOuterAlt(_localctx, 2);
          {
            this.state = 55;
            this.updateStatement();
          }
          break;
        case WebdaQLParserParser.SELECT:
          this.enterOuterAlt(_localctx, 3);
          {
            this.state = 56;
            this.selectStatement();
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
  public deleteStatement(): DeleteStatementContext {
    let _localctx: DeleteStatementContext = new DeleteStatementContext(this._ctx, this.state);
    this.enterRule(_localctx, 4, WebdaQLParserParser.RULE_deleteStatement);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 59;
        this.match(WebdaQLParserParser.DELETE);
        this.state = 61;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.WHERE) {
          {
            this.state = 60;
            this.whereClause();
          }
        }

        this.state = 64;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.LIMIT) {
          {
            this.state = 63;
            this.limitExpression();
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
  public updateStatement(): UpdateStatementContext {
    let _localctx: UpdateStatementContext = new UpdateStatementContext(this._ctx, this.state);
    this.enterRule(_localctx, 6, WebdaQLParserParser.RULE_updateStatement);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 66;
        this.match(WebdaQLParserParser.UPDATE);
        this.state = 67;
        this.match(WebdaQLParserParser.SET);
        this.state = 68;
        this.assignmentList();
        this.state = 70;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.WHERE) {
          {
            this.state = 69;
            this.whereClause();
          }
        }

        this.state = 73;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.LIMIT) {
          {
            this.state = 72;
            this.limitExpression();
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
  public selectStatement(): SelectStatementContext {
    let _localctx: SelectStatementContext = new SelectStatementContext(this._ctx, this.state);
    this.enterRule(_localctx, 8, WebdaQLParserParser.RULE_selectStatement);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 75;
        this.match(WebdaQLParserParser.SELECT);
        this.state = 76;
        this.fieldList();
        this.state = 78;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.WHERE) {
          {
            this.state = 77;
            this.whereClause();
          }
        }

        this.state = 81;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.ORDER_BY) {
          {
            this.state = 80;
            this.orderExpression();
          }
        }

        this.state = 84;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.LIMIT) {
          {
            this.state = 83;
            this.limitExpression();
          }
        }

        this.state = 87;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.OFFSET) {
          {
            this.state = 86;
            this.offsetExpression();
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
  public filterQuery(): FilterQueryContext {
    let _localctx: FilterQueryContext = new FilterQueryContext(this._ctx, this.state);
    this.enterRule(_localctx, 10, WebdaQLParserParser.RULE_filterQuery);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 90;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (
          ((_la & ~0x1f) === 0 &&
            ((1 << _la) &
              ((1 << WebdaQLParserParser.LR_BRACKET) |
                (1 << WebdaQLParserParser.TRUE) |
                (1 << WebdaQLParserParser.FALSE))) !==
              0) ||
          (((_la - 35) & ~0x1f) === 0 &&
            ((1 << (_la - 35)) &
              ((1 << (WebdaQLParserParser.DQUOTED_STRING_LITERAL - 35)) |
                (1 << (WebdaQLParserParser.SQUOTED_STRING_LITERAL - 35)) |
                (1 << (WebdaQLParserParser.INTEGER_LITERAL - 35)) |
                (1 << (WebdaQLParserParser.NUMBER_LITERAL - 35)) |
                (1 << (WebdaQLParserParser.IDENTIFIER - 35)) |
                (1 << (WebdaQLParserParser.IDENTIFIER_WITH_NUMBER - 35)))) !==
              0)
        ) {
          {
            this.state = 89;
            this.expression(0);
          }
        }

        this.state = 93;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.ORDER_BY) {
          {
            this.state = 92;
            this.orderExpression();
          }
        }

        this.state = 96;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.LIMIT) {
          {
            this.state = 95;
            this.limitExpression();
          }
        }

        this.state = 99;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.OFFSET) {
          {
            this.state = 98;
            this.offsetExpression();
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
  public whereClause(): WhereClauseContext {
    let _localctx: WhereClauseContext = new WhereClauseContext(this._ctx, this.state);
    this.enterRule(_localctx, 12, WebdaQLParserParser.RULE_whereClause);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 101;
        this.match(WebdaQLParserParser.WHERE);
        this.state = 102;
        this.expression(0);
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
  public assignmentList(): AssignmentListContext {
    let _localctx: AssignmentListContext = new AssignmentListContext(this._ctx, this.state);
    this.enterRule(_localctx, 14, WebdaQLParserParser.RULE_assignmentList);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 104;
        this.assignment();
        this.state = 109;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while (_la === WebdaQLParserParser.COMMA) {
          {
            {
              this.state = 105;
              this.match(WebdaQLParserParser.COMMA);
              this.state = 106;
              this.assignment();
            }
          }
          this.state = 111;
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
  // @RuleVersion(0)
  public assignment(): AssignmentContext {
    let _localctx: AssignmentContext = new AssignmentContext(this._ctx, this.state);
    this.enterRule(_localctx, 16, WebdaQLParserParser.RULE_assignment);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 112;
        this.identifier();
        this.state = 113;
        this.match(WebdaQLParserParser.EQUAL);
        this.state = 116;
        this._errHandler.sync(this);
        switch (this._input.LA(1)) {
          case WebdaQLParserParser.TRUE:
          case WebdaQLParserParser.FALSE:
          case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.INTEGER_LITERAL:
          case WebdaQLParserParser.NUMBER_LITERAL:
            {
              this.state = 114;
              this.values();
            }
            break;
          case WebdaQLParserParser.POSITIONAL_PARAMETER:
          case WebdaQLParserParser.NAMED_PARAMETER:
            {
              this.state = 115;
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
  public fieldList(): FieldListContext {
    let _localctx: FieldListContext = new FieldListContext(this._ctx, this.state);
    this.enterRule(_localctx, 18, WebdaQLParserParser.RULE_fieldList);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 118;
        this.identifier();
        this.state = 123;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while (_la === WebdaQLParserParser.COMMA) {
          {
            {
              this.state = 119;
              this.match(WebdaQLParserParser.COMMA);
              this.state = 120;
              this.identifier();
            }
          }
          this.state = 125;
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
  // @RuleVersion(0)
  public limitExpression(): LimitExpressionContext {
    let _localctx: LimitExpressionContext = new LimitExpressionContext(this._ctx, this.state);
    this.enterRule(_localctx, 20, WebdaQLParserParser.RULE_limitExpression);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 126;
        this.match(WebdaQLParserParser.LIMIT);
        this.state = 129;
        this._errHandler.sync(this);
        switch (this._input.LA(1)) {
          case WebdaQLParserParser.INTEGER_LITERAL:
            {
              this.state = 127;
              this.integerLiteral();
            }
            break;
          case WebdaQLParserParser.POSITIONAL_PARAMETER:
          case WebdaQLParserParser.NAMED_PARAMETER:
            {
              this.state = 128;
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
    this.enterRule(_localctx, 22, WebdaQLParserParser.RULE_offsetExpression);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 131;
        this.match(WebdaQLParserParser.OFFSET);
        this.state = 134;
        this._errHandler.sync(this);
        switch (this._input.LA(1)) {
          case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
            {
              this.state = 132;
              this.stringLiteral();
            }
            break;
          case WebdaQLParserParser.POSITIONAL_PARAMETER:
          case WebdaQLParserParser.NAMED_PARAMETER:
            {
              this.state = 133;
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
    this.enterRule(_localctx, 24, WebdaQLParserParser.RULE_orderFieldExpression);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 136;
        this.identifier();
        this.state = 138;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        if (_la === WebdaQLParserParser.ASC || _la === WebdaQLParserParser.DESC) {
          {
            this.state = 137;
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
    this.enterRule(_localctx, 26, WebdaQLParserParser.RULE_orderExpression);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 140;
        this.match(WebdaQLParserParser.ORDER_BY);
        this.state = 141;
        this.orderFieldExpression();
        this.state = 146;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while (_la === WebdaQLParserParser.COMMA) {
          {
            {
              this.state = 142;
              this.match(WebdaQLParserParser.COMMA);
              this.state = 143;
              this.orderFieldExpression();
            }
          }
          this.state = 148;
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
    let _startState: number = 28;
    this.enterRecursionRule(_localctx, 28, WebdaQLParserParser.RULE_expression, _p);
    let _la: number;
    try {
      let _alt: number;
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 188;
        this._errHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this._input, 25, this._ctx)) {
          case 1:
            {
              _localctx = new LikeExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;

              this.state = 150;
              this.identifier();
              this.state = 151;
              this.match(WebdaQLParserParser.LIKE);
              this.state = 154;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
                  {
                    this.state = 152;
                    this.stringLiteral();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 153;
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
              this.state = 156;
              this.identifier();
              this.state = 157;
              this.match(WebdaQLParserParser.IN);
              this.state = 160;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.LR_SQ_BRACKET:
                  {
                    this.state = 158;
                    this.setExpression();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 159;
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
              this.state = 162;
              this.identifier();
              this.state = 163;
              this.match(WebdaQLParserParser.CONTAINS);
              this.state = 166;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
                  {
                    this.state = 164;
                    this.stringLiteral();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 165;
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
              this.state = 168;
              this.identifier();
              this.state = 169;
              this.match(WebdaQLParserParser.IS);
              this.state = 170;
              this.match(WebdaQLParserParser.NULL);
            }
            break;

          case 5:
            {
              _localctx = new IsNotNullExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 172;
              this.identifier();
              this.state = 173;
              this.match(WebdaQLParserParser.IS);
              this.state = 174;
              this.match(WebdaQLParserParser.NOT);
              this.state = 175;
              this.match(WebdaQLParserParser.NULL);
            }
            break;

          case 6:
            {
              _localctx = new BinaryComparisonExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 177;
              this.identifier();
              this.state = 178;
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
              this.state = 181;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.TRUE:
                case WebdaQLParserParser.FALSE:
                case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.INTEGER_LITERAL:
                case WebdaQLParserParser.NUMBER_LITERAL:
                  {
                    this.state = 179;
                    this.values();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 180;
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
              this.state = 183;
              this.match(WebdaQLParserParser.LR_BRACKET);
              this.state = 184;
              this.expression(0);
              this.state = 185;
              this.match(WebdaQLParserParser.RR_BRACKET);
            }
            break;

          case 8:
            {
              _localctx = new AtomExpressionContext(_localctx);
              this._ctx = _localctx;
              _prevctx = _localctx;
              this.state = 187;
              this.atom();
            }
            break;
        }
        this._ctx._stop = this._input.tryLT(-1);
        this.state = 198;
        this._errHandler.sync(this);
        _alt = this.interpreter.adaptivePredict(this._input, 27, this._ctx);
        while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
          if (_alt === 1) {
            if (this._parseListeners != null) {
              this.triggerExitRuleEvent();
            }
            _prevctx = _localctx;
            {
              this.state = 196;
              this._errHandler.sync(this);
              switch (this.interpreter.adaptivePredict(this._input, 26, this._ctx)) {
                case 1:
                  {
                    _localctx = new AndLogicExpressionContext(new ExpressionContext(_parentctx, _parentState));
                    this.pushNewRecursionContext(_localctx, _startState, WebdaQLParserParser.RULE_expression);
                    this.state = 190;
                    if (!this.precpred(this._ctx, 4)) {
                      throw this.createFailedPredicateException("this.precpred(this._ctx, 4)");
                    }
                    this.state = 191;
                    this.match(WebdaQLParserParser.AND);
                    this.state = 192;
                    this.expression(5);
                  }
                  break;

                case 2:
                  {
                    _localctx = new OrLogicExpressionContext(new ExpressionContext(_parentctx, _parentState));
                    this.pushNewRecursionContext(_localctx, _startState, WebdaQLParserParser.RULE_expression);
                    this.state = 193;
                    if (!this.precpred(this._ctx, 3)) {
                      throw this.createFailedPredicateException("this.precpred(this._ctx, 3)");
                    }
                    this.state = 194;
                    this.match(WebdaQLParserParser.OR);
                    this.state = 195;
                    this.expression(4);
                  }
                  break;
              }
            }
          }
          this.state = 200;
          this._errHandler.sync(this);
          _alt = this.interpreter.adaptivePredict(this._input, 27, this._ctx);
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
    this.enterRule(_localctx, 30, WebdaQLParserParser.RULE_values);
    try {
      this.state = 205;
      this._errHandler.sync(this);
      switch (this._input.LA(1)) {
        case WebdaQLParserParser.TRUE:
        case WebdaQLParserParser.FALSE:
          _localctx = new BooleanAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 1);
          {
            this.state = 201;
            this.booleanLiteral();
          }
          break;
        case WebdaQLParserParser.INTEGER_LITERAL:
          _localctx = new IntegerAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 2);
          {
            this.state = 202;
            this.integerLiteral();
          }
          break;
        case WebdaQLParserParser.NUMBER_LITERAL:
          _localctx = new NumberAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 3);
          {
            this.state = 203;
            this.numberLiteral();
          }
          break;
        case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
        case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
          _localctx = new StringAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 4);
          {
            this.state = 204;
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
    this.enterRule(_localctx, 32, WebdaQLParserParser.RULE_atom);
    try {
      this.state = 209;
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
            this.state = 207;
            this.values();
          }
          break;
        case WebdaQLParserParser.IDENTIFIER:
        case WebdaQLParserParser.IDENTIFIER_WITH_NUMBER:
          _localctx = new IdentifierAtomContext(_localctx);
          this.enterOuterAlt(_localctx, 2);
          {
            this.state = 208;
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
    this.enterRule(_localctx, 34, WebdaQLParserParser.RULE_identifier);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 211;
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
    this.enterRule(_localctx, 36, WebdaQLParserParser.RULE_booleanLiteral);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 213;
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
    this.enterRule(_localctx, 38, WebdaQLParserParser.RULE_stringLiteral);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 215;
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
    this.enterRule(_localctx, 40, WebdaQLParserParser.RULE_integerLiteral);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 217;
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
    this.enterRule(_localctx, 42, WebdaQLParserParser.RULE_numberLiteral);
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 219;
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
    this.enterRule(_localctx, 44, WebdaQLParserParser.RULE_parameter);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 221;
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
    this.enterRule(_localctx, 46, WebdaQLParserParser.RULE_setExpression);
    let _la: number;
    try {
      this.enterOuterAlt(_localctx, 1);
      {
        this.state = 223;
        this.match(WebdaQLParserParser.LR_SQ_BRACKET);
        this.state = 226;
        this._errHandler.sync(this);
        switch (this._input.LA(1)) {
          case WebdaQLParserParser.TRUE:
          case WebdaQLParserParser.FALSE:
          case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
          case WebdaQLParserParser.INTEGER_LITERAL:
          case WebdaQLParserParser.NUMBER_LITERAL:
            {
              this.state = 224;
              this.values();
            }
            break;
          case WebdaQLParserParser.POSITIONAL_PARAMETER:
          case WebdaQLParserParser.NAMED_PARAMETER:
            {
              this.state = 225;
              this.parameter();
            }
            break;
          default:
            throw new NoViableAltException(this);
        }
        this.state = 235;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while (_la === WebdaQLParserParser.COMMA) {
          {
            {
              this.state = 228;
              this.match(WebdaQLParserParser.COMMA);
              this.state = 231;
              this._errHandler.sync(this);
              switch (this._input.LA(1)) {
                case WebdaQLParserParser.TRUE:
                case WebdaQLParserParser.FALSE:
                case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
                case WebdaQLParserParser.INTEGER_LITERAL:
                case WebdaQLParserParser.NUMBER_LITERAL:
                  {
                    this.state = 229;
                    this.values();
                  }
                  break;
                case WebdaQLParserParser.POSITIONAL_PARAMETER:
                case WebdaQLParserParser.NAMED_PARAMETER:
                  {
                    this.state = 230;
                    this.parameter();
                  }
                  break;
                default:
                  throw new NoViableAltException(this);
              }
            }
          }
          this.state = 237;
          this._errHandler.sync(this);
          _la = this._input.LA(1);
        }
        this.state = 238;
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
      case 14:
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
    "\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03-\xF3\x04\x02" +
    "\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
    "\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
    "\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
    "\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17\x04" +
    "\x18\t\x18\x04\x19\t\x19\x03\x02\x03\x02\x05\x025\n\x02\x03\x02\x03\x02" +
    "\x03\x03\x03\x03\x03\x03\x05\x03<\n\x03\x03\x04\x03\x04\x05\x04@\n\x04" +
    "\x03\x04\x05\x04C\n\x04\x03\x05\x03\x05\x03\x05\x03\x05\x05\x05I\n\x05" +
    "\x03\x05\x05\x05L\n\x05\x03\x06\x03\x06\x03\x06\x05\x06Q\n\x06\x03\x06" +
    "\x05\x06T\n\x06\x03\x06\x05\x06W\n\x06\x03\x06\x05\x06Z\n\x06\x03\x07" +
    "\x05\x07]\n\x07\x03\x07\x05\x07`\n\x07\x03\x07\x05\x07c\n\x07\x03\x07" +
    "\x05\x07f\n\x07\x03\b\x03\b\x03\b\x03\t\x03\t\x03\t\x07\tn\n\t\f\t\x0E" +
    "\tq\v\t\x03\n\x03\n\x03\n\x03\n\x05\nw\n\n\x03\v\x03\v\x03\v\x07\v|\n" +
    "\v\f\v\x0E\v\x7F\v\v\x03\f\x03\f\x03\f\x05\f\x84\n\f\x03\r\x03\r\x03\r" +
    "\x05\r\x89\n\r\x03\x0E\x03\x0E\x05\x0E\x8D\n\x0E\x03\x0F\x03\x0F\x03\x0F" +
    "\x03\x0F\x07\x0F\x93\n\x0F\f\x0F\x0E\x0F\x96\v\x0F\x03\x10\x03\x10\x03" +
    "\x10\x03\x10\x03\x10\x05\x10\x9D\n\x10\x03\x10\x03\x10\x03\x10\x03\x10" +
    "\x05\x10\xA3\n\x10\x03\x10\x03\x10\x03\x10\x03\x10\x05\x10\xA9\n\x10\x03" +
    "\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03" +
    "\x10\x03\x10\x03\x10\x03\x10\x05\x10\xB8\n\x10\x03\x10\x03\x10\x03\x10" +
    "\x03\x10\x03\x10\x05\x10\xBF\n\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03" +
    "\x10\x03\x10\x07\x10\xC7\n\x10\f\x10\x0E\x10\xCA\v\x10\x03\x11\x03\x11" +
    "\x03\x11\x03\x11\x05\x11\xD0\n\x11\x03\x12\x03\x12\x05\x12\xD4\n\x12\x03" +
    "\x13\x03\x13\x03\x14\x03\x14\x03\x15\x03\x15\x03\x16\x03\x16\x03\x17\x03" +
    "\x17\x03\x18\x03\x18\x03\x19\x03\x19\x03\x19\x05\x19\xE5\n\x19\x03\x19" +
    "\x03\x19\x03\x19\x05\x19\xEA\n\x19\x07\x19\xEC\n\x19\f\x19\x0E\x19\xEF" +
    "\v\x19\x03\x19\x03\x19\x03\x19\x02\x02\x03\x1E\x1A\x02\x02\x04\x02\x06" +
    "\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02" +
    '\x1A\x02\x1C\x02\x1E\x02 \x02"\x02$\x02&\x02(\x02*\x02,\x02.\x020\x02' +
    "\x02\b\x03\x02#$\x03\x02\x12\x17\x03\x02+,\x03\x02\x1E\x1F\x03\x02%&\x03" +
    "\x02)*\x02\u0104\x024\x03\x02\x02\x02\x04;\x03\x02\x02\x02\x06=\x03\x02" +
    "\x02\x02\bD\x03\x02\x02\x02\nM\x03\x02\x02\x02\f\\\x03\x02\x02\x02\x0E" +
    "g\x03\x02\x02\x02\x10j\x03\x02\x02\x02\x12r\x03\x02\x02\x02\x14x\x03\x02" +
    "\x02\x02\x16\x80\x03\x02\x02\x02\x18\x85\x03\x02\x02\x02\x1A\x8A\x03\x02" +
    "\x02\x02\x1C\x8E\x03\x02\x02\x02\x1E\xBE\x03\x02\x02\x02 \xCF\x03\x02" +
    '\x02\x02"\xD3\x03\x02\x02\x02$\xD5\x03\x02\x02\x02&\xD7\x03\x02\x02\x02' +
    "(\xD9\x03\x02\x02\x02*\xDB\x03\x02\x02\x02,\xDD\x03\x02\x02\x02.\xDF\x03" +
    "\x02\x02\x020\xE1\x03\x02\x02\x0225\x05\x04\x03\x0235\x05\f\x07\x0242" +
    "\x03\x02\x02\x0243\x03\x02\x02\x0256\x03\x02\x02\x0267\x07\x02\x02\x03" +
    "7\x03\x03\x02\x02\x028<\x05\x06\x04\x029<\x05\b\x05\x02:<\x05\n\x06\x02" +
    ";8\x03\x02\x02\x02;9\x03\x02\x02\x02;:\x03\x02\x02\x02<\x05\x03\x02\x02" +
    "\x02=?\x07\v\x02\x02>@\x05\x0E\b\x02?>\x03\x02\x02\x02?@\x03\x02\x02\x02" +
    "@B\x03\x02\x02\x02AC\x05\x16\f\x02BA\x03\x02\x02\x02BC\x03\x02\x02\x02" +
    "C\x07\x03\x02\x02\x02DE\x07\f\x02\x02EF\x07\x0E\x02\x02FH\x05\x10\t\x02" +
    "GI\x05\x0E\b\x02HG\x03\x02\x02\x02HI\x03\x02\x02\x02IK\x03\x02\x02\x02" +
    "JL\x05\x16\f\x02KJ\x03\x02\x02\x02KL\x03\x02\x02\x02L\t\x03\x02\x02\x02" +
    "MN\x07\r\x02\x02NP\x05\x14\v\x02OQ\x05\x0E\b\x02PO\x03\x02\x02\x02PQ\x03" +
    "\x02\x02\x02QS\x03\x02\x02\x02RT\x05\x1C\x0F\x02SR\x03\x02\x02\x02ST\x03" +
    "\x02\x02\x02TV\x03\x02\x02\x02UW\x05\x16\f\x02VU\x03\x02\x02\x02VW\x03" +
    "\x02\x02\x02WY\x03\x02\x02\x02XZ\x05\x18\r\x02YX\x03\x02\x02\x02YZ\x03" +
    "\x02\x02\x02Z\v\x03\x02\x02\x02[]\x05\x1E\x10\x02\\[\x03\x02\x02\x02\\" +
    "]\x03\x02\x02\x02]_\x03\x02\x02\x02^`\x05\x1C\x0F\x02_^\x03\x02\x02\x02" +
    "_`\x03\x02\x02\x02`b\x03\x02\x02\x02ac\x05\x16\f\x02ba\x03\x02\x02\x02" +
    "bc\x03\x02\x02\x02ce\x03\x02\x02\x02df\x05\x18\r\x02ed\x03\x02\x02\x02" +
    "ef\x03\x02\x02\x02f\r\x03\x02\x02\x02gh\x07\x0F\x02\x02hi\x05\x1E\x10" +
    "\x02i\x0F\x03\x02\x02\x02jo\x05\x12\n\x02kl\x07\x06\x02\x02ln\x05\x12" +
    "\n\x02mk\x03\x02\x02\x02nq\x03\x02\x02\x02om\x03\x02\x02\x02op\x03\x02" +
    "\x02\x02p\x11\x03\x02\x02\x02qo\x03\x02\x02\x02rs\x05$\x13\x02sv\x07\x12" +
    "\x02\x02tw\x05 \x11\x02uw\x05.\x18\x02vt\x03\x02\x02\x02vu\x03\x02\x02" +
    "\x02w\x13\x03\x02\x02\x02x}\x05$\x13\x02yz\x07\x06\x02\x02z|\x05$\x13" +
    "\x02{y\x03\x02\x02\x02|\x7F\x03\x02\x02\x02}{\x03\x02\x02\x02}~\x03\x02" +
    "\x02\x02~\x15\x03\x02\x02\x02\x7F}\x03\x02\x02\x02\x80\x83\x07 \x02\x02" +
    "\x81\x84\x05*\x16\x02\x82\x84\x05.\x18\x02\x83\x81\x03\x02\x02\x02\x83" +
    "\x82\x03\x02\x02\x02\x84\x17\x03\x02\x02\x02\x85\x88\x07!\x02\x02\x86" +
    "\x89\x05(\x15\x02\x87\x89\x05.\x18\x02\x88\x86\x03\x02\x02\x02\x88\x87" +
    "\x03\x02\x02\x02\x89\x19\x03\x02\x02\x02\x8A\x8C\x05$\x13\x02\x8B\x8D" +
    "\t\x02\x02\x02\x8C\x8B\x03\x02\x02\x02\x8C\x8D\x03\x02\x02\x02\x8D\x1B" +
    '\x03\x02\x02\x02\x8E\x8F\x07"\x02\x02\x8F\x94\x05\x1A\x0E\x02\x90\x91' +
    "\x07\x06\x02\x02\x91\x93\x05\x1A\x0E\x02\x92\x90\x03\x02\x02\x02\x93\x96" +
    "\x03\x02\x02\x02\x94\x92\x03\x02\x02\x02\x94\x95\x03\x02\x02\x02\x95\x1D" +
    "\x03\x02\x02\x02\x96\x94\x03\x02\x02\x02\x97\x98\b\x10\x01\x02\x98\x99" +
    "\x05$\x13\x02\x99\x9C\x07\x18\x02\x02\x9A\x9D\x05(\x15\x02\x9B\x9D\x05" +
    ".\x18\x02\x9C\x9A\x03\x02\x02\x02\x9C\x9B\x03\x02\x02\x02\x9D\xBF\x03" +
    "\x02\x02\x02\x9E\x9F\x05$\x13\x02\x9F\xA2\x07\x19\x02\x02\xA0\xA3\x05" +
    "0\x19\x02\xA1\xA3\x05.\x18\x02\xA2\xA0\x03\x02\x02\x02\xA2\xA1\x03\x02" +
    "\x02\x02\xA3\xBF\x03\x02\x02\x02\xA4\xA5\x05$\x13\x02\xA5\xA8\x07\x1A" +
    "\x02\x02\xA6\xA9\x05(\x15\x02\xA7\xA9\x05.\x18\x02\xA8\xA6\x03\x02\x02" +
    "\x02\xA8\xA7\x03\x02\x02\x02\xA9\xBF\x03\x02\x02\x02\xAA\xAB\x05$\x13" +
    "\x02\xAB\xAC\x07\x1B\x02\x02\xAC\xAD\x07\x1D\x02\x02\xAD\xBF\x03\x02\x02" +
    "\x02\xAE\xAF\x05$\x13\x02\xAF\xB0\x07\x1B\x02\x02\xB0\xB1\x07\x1C\x02" +
    "\x02\xB1\xB2\x07\x1D\x02\x02\xB2\xBF\x03\x02\x02\x02\xB3\xB4\x05$\x13" +
    "\x02\xB4\xB7\t\x03\x02\x02\xB5\xB8\x05 \x11\x02\xB6\xB8\x05.\x18\x02\xB7" +
    "\xB5\x03\x02\x02\x02\xB7\xB6\x03\x02\x02\x02\xB8\xBF\x03\x02\x02\x02\xB9" +
    "\xBA\x07\x04\x02\x02\xBA\xBB\x05\x1E\x10\x02\xBB\xBC\x07\x05\x02\x02\xBC" +
    '\xBF\x03\x02\x02\x02\xBD\xBF\x05"\x12\x02\xBE\x97\x03\x02\x02\x02\xBE' +
    "\x9E\x03\x02\x02\x02\xBE\xA4\x03\x02\x02\x02\xBE\xAA\x03\x02\x02\x02\xBE" +
    "\xAE\x03\x02\x02\x02\xBE\xB3\x03\x02\x02\x02\xBE\xB9\x03\x02\x02\x02\xBE" +
    "\xBD\x03\x02\x02\x02\xBF\xC8\x03\x02\x02\x02\xC0\xC1\f\x06\x02\x02\xC1" +
    "\xC2\x07\x10\x02\x02\xC2\xC7\x05\x1E\x10\x07\xC3\xC4\f\x05\x02\x02\xC4" +
    "\xC5\x07\x11\x02\x02\xC5\xC7\x05\x1E\x10\x06\xC6\xC0\x03\x02\x02\x02\xC6" +
    "\xC3\x03\x02\x02\x02\xC7\xCA\x03\x02\x02\x02\xC8\xC6\x03\x02\x02\x02\xC8" +
    "\xC9\x03\x02\x02\x02\xC9\x1F\x03\x02\x02\x02\xCA\xC8\x03\x02\x02\x02\xCB" +
    "\xD0\x05&\x14\x02\xCC\xD0\x05*\x16\x02\xCD\xD0\x05,\x17\x02\xCE\xD0\x05" +
    "(\x15\x02\xCF\xCB\x03\x02\x02\x02\xCF\xCC\x03\x02\x02\x02\xCF\xCD\x03" +
    "\x02\x02\x02\xCF\xCE\x03\x02\x02\x02\xD0!\x03\x02\x02\x02\xD1\xD4\x05" +
    " \x11\x02\xD2\xD4\x05$\x13\x02\xD3\xD1\x03\x02\x02\x02\xD3\xD2\x03\x02" +
    "\x02\x02\xD4#\x03\x02\x02\x02\xD5\xD6\t\x04\x02\x02\xD6%\x03\x02\x02\x02" +
    "\xD7\xD8\t\x05\x02\x02\xD8\'\x03\x02\x02\x02\xD9\xDA\t\x06\x02\x02\xDA" +
    ")\x03\x02\x02\x02\xDB\xDC\x07\'\x02\x02\xDC+\x03\x02\x02\x02\xDD\xDE\x07" +
    "(\x02\x02\xDE-\x03\x02\x02\x02\xDF\xE0\t\x07\x02\x02\xE0/\x03\x02\x02" +
    "\x02\xE1\xE4\x07\t\x02\x02\xE2\xE5\x05 \x11\x02\xE3\xE5\x05.\x18\x02\xE4" +
    "\xE2\x03\x02\x02\x02\xE4\xE3\x03\x02\x02\x02\xE5\xED\x03\x02\x02\x02\xE6" +
    "\xE9\x07\x06\x02\x02\xE7\xEA\x05 \x11\x02\xE8\xEA\x05.\x18\x02\xE9\xE7" +
    "\x03\x02\x02\x02\xE9\xE8\x03\x02\x02\x02\xEA\xEC\x03\x02\x02\x02\xEB\xE6" +
    "\x03\x02\x02\x02\xEC\xEF\x03\x02\x02\x02\xED\xEB\x03\x02\x02\x02\xED\xEE" +
    "\x03\x02\x02\x02\xEE\xF0\x03\x02\x02\x02\xEF\xED\x03\x02\x02\x02\xF0\xF1" +
    "\x07\n\x02\x02\xF11\x03\x02\x02\x02#4;?BHKPSVY\\_beov}\x83\x88\x8C\x94" +
    "\x9C\xA2\xA8\xB7\xBE\xC6\xC8\xCF\xD3\xE4\xE9\xED";
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
  public statement(): StatementContext | undefined {
    return this.tryGetRuleContext(0, StatementContext);
  }
  public filterQuery(): FilterQueryContext | undefined {
    return this.tryGetRuleContext(0, FilterQueryContext);
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

export class StatementContext extends ParserRuleContext {
  public deleteStatement(): DeleteStatementContext | undefined {
    return this.tryGetRuleContext(0, DeleteStatementContext);
  }
  public updateStatement(): UpdateStatementContext | undefined {
    return this.tryGetRuleContext(0, UpdateStatementContext);
  }
  public selectStatement(): SelectStatementContext | undefined {
    return this.tryGetRuleContext(0, SelectStatementContext);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_statement;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterStatement) {
      listener.enterStatement(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitStatement) {
      listener.exitStatement(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitStatement) {
      return visitor.visitStatement(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class DeleteStatementContext extends ParserRuleContext {
  public DELETE(): TerminalNode {
    return this.getToken(WebdaQLParserParser.DELETE, 0);
  }
  public whereClause(): WhereClauseContext | undefined {
    return this.tryGetRuleContext(0, WhereClauseContext);
  }
  public limitExpression(): LimitExpressionContext | undefined {
    return this.tryGetRuleContext(0, LimitExpressionContext);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_deleteStatement;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterDeleteStatement) {
      listener.enterDeleteStatement(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitDeleteStatement) {
      listener.exitDeleteStatement(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitDeleteStatement) {
      return visitor.visitDeleteStatement(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class UpdateStatementContext extends ParserRuleContext {
  public UPDATE(): TerminalNode {
    return this.getToken(WebdaQLParserParser.UPDATE, 0);
  }
  public SET(): TerminalNode {
    return this.getToken(WebdaQLParserParser.SET, 0);
  }
  public assignmentList(): AssignmentListContext {
    return this.getRuleContext(0, AssignmentListContext);
  }
  public whereClause(): WhereClauseContext | undefined {
    return this.tryGetRuleContext(0, WhereClauseContext);
  }
  public limitExpression(): LimitExpressionContext | undefined {
    return this.tryGetRuleContext(0, LimitExpressionContext);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_updateStatement;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterUpdateStatement) {
      listener.enterUpdateStatement(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitUpdateStatement) {
      listener.exitUpdateStatement(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitUpdateStatement) {
      return visitor.visitUpdateStatement(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SelectStatementContext extends ParserRuleContext {
  public SELECT(): TerminalNode {
    return this.getToken(WebdaQLParserParser.SELECT, 0);
  }
  public fieldList(): FieldListContext {
    return this.getRuleContext(0, FieldListContext);
  }
  public whereClause(): WhereClauseContext | undefined {
    return this.tryGetRuleContext(0, WhereClauseContext);
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
    return WebdaQLParserParser.RULE_selectStatement;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterSelectStatement) {
      listener.enterSelectStatement(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitSelectStatement) {
      listener.exitSelectStatement(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitSelectStatement) {
      return visitor.visitSelectStatement(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FilterQueryContext extends ParserRuleContext {
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
    return WebdaQLParserParser.RULE_filterQuery;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterFilterQuery) {
      listener.enterFilterQuery(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitFilterQuery) {
      listener.exitFilterQuery(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitFilterQuery) {
      return visitor.visitFilterQuery(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class WhereClauseContext extends ParserRuleContext {
  public WHERE(): TerminalNode {
    return this.getToken(WebdaQLParserParser.WHERE, 0);
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_whereClause;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterWhereClause) {
      listener.enterWhereClause(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitWhereClause) {
      listener.exitWhereClause(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitWhereClause) {
      return visitor.visitWhereClause(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AssignmentListContext extends ParserRuleContext {
  public assignment(): AssignmentContext[];
  public assignment(i: number): AssignmentContext;
  public assignment(i?: number): AssignmentContext | AssignmentContext[] {
    if (i === undefined) {
      return this.getRuleContexts(AssignmentContext);
    } else {
      return this.getRuleContext(i, AssignmentContext);
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
    return WebdaQLParserParser.RULE_assignmentList;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterAssignmentList) {
      listener.enterAssignmentList(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitAssignmentList) {
      listener.exitAssignmentList(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitAssignmentList) {
      return visitor.visitAssignmentList(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AssignmentContext extends ParserRuleContext {
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext);
  }
  public EQUAL(): TerminalNode {
    return this.getToken(WebdaQLParserParser.EQUAL, 0);
  }
  public values(): ValuesContext | undefined {
    return this.tryGetRuleContext(0, ValuesContext);
  }
  public parameter(): ParameterContext | undefined {
    return this.tryGetRuleContext(0, ParameterContext);
  }
  constructor(parent: ParserRuleContext | undefined, invokingState: number) {
    super(parent, invokingState);
  }
  // @Override
  public get ruleIndex(): number {
    return WebdaQLParserParser.RULE_assignment;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterAssignment) {
      listener.enterAssignment(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitAssignment) {
      listener.exitAssignment(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitAssignment) {
      return visitor.visitAssignment(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FieldListContext extends ParserRuleContext {
  public identifier(): IdentifierContext[];
  public identifier(i: number): IdentifierContext;
  public identifier(i?: number): IdentifierContext | IdentifierContext[] {
    if (i === undefined) {
      return this.getRuleContexts(IdentifierContext);
    } else {
      return this.getRuleContext(i, IdentifierContext);
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
    return WebdaQLParserParser.RULE_fieldList;
  }
  // @Override
  public enterRule(listener: WebdaQLParserListener): void {
    if (listener.enterFieldList) {
      listener.enterFieldList(this);
    }
  }
  // @Override
  public exitRule(listener: WebdaQLParserListener): void {
    if (listener.exitFieldList) {
      listener.exitFieldList(this);
    }
  }
  // @Override
  public accept<Result>(visitor: WebdaQLParserVisitor<Result>): Result {
    if (visitor.visitFieldList) {
      return visitor.visitFieldList(this);
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

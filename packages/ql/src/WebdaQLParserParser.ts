// Generated from src/WebdaQLParser.g4 by ANTLR 4.9.0-SNAPSHOT


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
	public static readonly TRUE = 25;
	public static readonly FALSE = 26;
	public static readonly LIMIT = 27;
	public static readonly OFFSET = 28;
	public static readonly ORDER_BY = 29;
	public static readonly ASC = 30;
	public static readonly DESC = 31;
	public static readonly DQUOTED_STRING_LITERAL = 32;
	public static readonly SQUOTED_STRING_LITERAL = 33;
	public static readonly INTEGER_LITERAL = 34;
	public static readonly IDENTIFIER = 35;
	public static readonly IDENTIFIER_WITH_NUMBER = 36;
	public static readonly FUNCTION_IDENTIFIER_WITH_UNDERSCORE = 37;
	public static readonly RULE_webdaql = 0;
	public static readonly RULE_statement = 1;
	public static readonly RULE_deleteStatement = 2;
	public static readonly RULE_updateStatement = 3;
	public static readonly RULE_selectStatement = 4;
	public static readonly RULE_filterQuery = 5;
	public static readonly RULE_assignmentList = 6;
	public static readonly RULE_assignment = 7;
	public static readonly RULE_fieldList = 8;
	public static readonly RULE_limitExpression = 9;
	public static readonly RULE_offsetExpression = 10;
	public static readonly RULE_orderFieldExpression = 11;
	public static readonly RULE_orderExpression = 12;
	public static readonly RULE_expression = 13;
	public static readonly RULE_values = 14;
	public static readonly RULE_atom = 15;
	public static readonly RULE_identifier = 16;
	public static readonly RULE_booleanLiteral = 17;
	public static readonly RULE_stringLiteral = 18;
	public static readonly RULE_integerLiteral = 19;
	public static readonly RULE_setExpression = 20;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"webdaql", "statement", "deleteStatement", "updateStatement", "selectStatement", 
		"filterQuery", "assignmentList", "assignment", "fieldList", "limitExpression", 
		"offsetExpression", "orderFieldExpression", "orderExpression", "expression", 
		"values", "atom", "identifier", "booleanLiteral", "stringLiteral", "integerLiteral", 
		"setExpression",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, undefined, "'('", "')'", "','", "'''", "'\"'", "'['", "']'", 
		"'DELETE'", "'UPDATE'", "'SELECT'", "'SET'", "'WHERE'", "'AND'", "'OR'", 
		"'='", "'!='", "'>'", "'>='", "'<'", "'<='", "'LIKE'", "'IN'", "'CONTAINS'", 
		"'TRUE'", "'FALSE'", "'LIMIT'", "'OFFSET'", "'ORDER BY'", "'ASC'", "'DESC'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "SPACE", "LR_BRACKET", "RR_BRACKET", "COMMA", "SINGLE_QUOTE_SYMB", 
		"DOUBLE_QUOTE_SYMB", "LR_SQ_BRACKET", "RR_SQ_BRACKET", "DELETE", "UPDATE", 
		"SELECT", "SET", "WHERE", "AND", "OR", "EQUAL", "NOT_EQUAL", "GREATER", 
		"GREATER_OR_EQUAL", "LESS", "LESS_OR_EQUAL", "LIKE", "IN", "CONTAINS", 
		"TRUE", "FALSE", "LIMIT", "OFFSET", "ORDER_BY", "ASC", "DESC", "DQUOTED_STRING_LITERAL", 
		"SQUOTED_STRING_LITERAL", "INTEGER_LITERAL", "IDENTIFIER", "IDENTIFIER_WITH_NUMBER", 
		"FUNCTION_IDENTIFIER_WITH_UNDERSCORE",
	];
	public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(WebdaQLParserParser._LITERAL_NAMES, WebdaQLParserParser._SYMBOLIC_NAMES, []);

	// @Override
	// @NotNull
	public get vocabulary(): Vocabulary {
		return WebdaQLParserParser.VOCABULARY;
	}
	// tslint:enable:no-trailing-whitespace

	// @Override
	public get grammarFileName(): string { return "WebdaQLParser.g4"; }

	// @Override
	public get ruleNames(): string[] { return WebdaQLParserParser.ruleNames; }

	// @Override
	public get serializedATN(): string { return WebdaQLParserParser._serializedATN; }

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
			this.state = 44;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case WebdaQLParserParser.DELETE:
			case WebdaQLParserParser.UPDATE:
			case WebdaQLParserParser.SELECT:
				{
				this.state = 42;
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
			case WebdaQLParserParser.IDENTIFIER:
			case WebdaQLParserParser.IDENTIFIER_WITH_NUMBER:
				{
				this.state = 43;
				this.filterQuery();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 46;
			this.match(WebdaQLParserParser.EOF);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public statement(): StatementContext {
		let _localctx: StatementContext = new StatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 2, WebdaQLParserParser.RULE_statement);
		try {
			this.state = 51;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case WebdaQLParserParser.DELETE:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 48;
				this.deleteStatement();
				}
				break;
			case WebdaQLParserParser.UPDATE:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 49;
				this.updateStatement();
				}
				break;
			case WebdaQLParserParser.SELECT:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 50;
				this.selectStatement();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
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
			this.state = 53;
			this.match(WebdaQLParserParser.DELETE);
			this.state = 56;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.WHERE) {
				{
				this.state = 54;
				this.match(WebdaQLParserParser.WHERE);
				this.state = 55;
				this.expression(0);
				}
			}

			this.state = 59;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.LIMIT) {
				{
				this.state = 58;
				this.limitExpression();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
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
			this.state = 61;
			this.match(WebdaQLParserParser.UPDATE);
			this.state = 62;
			this.match(WebdaQLParserParser.SET);
			this.state = 63;
			this.assignmentList();
			this.state = 66;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.WHERE) {
				{
				this.state = 64;
				this.match(WebdaQLParserParser.WHERE);
				this.state = 65;
				this.expression(0);
				}
			}

			this.state = 69;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.LIMIT) {
				{
				this.state = 68;
				this.limitExpression();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
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
			this.state = 71;
			this.match(WebdaQLParserParser.SELECT);
			this.state = 72;
			this.fieldList();
			this.state = 75;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.WHERE) {
				{
				this.state = 73;
				this.match(WebdaQLParserParser.WHERE);
				this.state = 74;
				this.expression(0);
				}
			}

			this.state = 78;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.ORDER_BY) {
				{
				this.state = 77;
				this.orderExpression();
				}
			}

			this.state = 81;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.LIMIT) {
				{
				this.state = 80;
				this.limitExpression();
				}
			}

			this.state = 84;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.OFFSET) {
				{
				this.state = 83;
				this.offsetExpression();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
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
			this.state = 87;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << WebdaQLParserParser.LR_BRACKET) | (1 << WebdaQLParserParser.TRUE) | (1 << WebdaQLParserParser.FALSE))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (WebdaQLParserParser.DQUOTED_STRING_LITERAL - 32)) | (1 << (WebdaQLParserParser.SQUOTED_STRING_LITERAL - 32)) | (1 << (WebdaQLParserParser.INTEGER_LITERAL - 32)) | (1 << (WebdaQLParserParser.IDENTIFIER - 32)) | (1 << (WebdaQLParserParser.IDENTIFIER_WITH_NUMBER - 32)))) !== 0)) {
				{
				this.state = 86;
				this.expression(0);
				}
			}

			this.state = 90;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.ORDER_BY) {
				{
				this.state = 89;
				this.orderExpression();
				}
			}

			this.state = 93;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.LIMIT) {
				{
				this.state = 92;
				this.limitExpression();
				}
			}

			this.state = 96;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.OFFSET) {
				{
				this.state = 95;
				this.offsetExpression();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public assignmentList(): AssignmentListContext {
		let _localctx: AssignmentListContext = new AssignmentListContext(this._ctx, this.state);
		this.enterRule(_localctx, 12, WebdaQLParserParser.RULE_assignmentList);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 98;
			this.assignment();
			this.state = 103;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === WebdaQLParserParser.COMMA) {
				{
				{
				this.state = 99;
				this.match(WebdaQLParserParser.COMMA);
				this.state = 100;
				this.assignment();
				}
				}
				this.state = 105;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public assignment(): AssignmentContext {
		let _localctx: AssignmentContext = new AssignmentContext(this._ctx, this.state);
		this.enterRule(_localctx, 14, WebdaQLParserParser.RULE_assignment);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 106;
			this.identifier();
			this.state = 107;
			this.match(WebdaQLParserParser.EQUAL);
			this.state = 108;
			this.values();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public fieldList(): FieldListContext {
		let _localctx: FieldListContext = new FieldListContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, WebdaQLParserParser.RULE_fieldList);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 110;
			this.identifier();
			this.state = 115;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === WebdaQLParserParser.COMMA) {
				{
				{
				this.state = 111;
				this.match(WebdaQLParserParser.COMMA);
				this.state = 112;
				this.identifier();
				}
				}
				this.state = 117;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public limitExpression(): LimitExpressionContext {
		let _localctx: LimitExpressionContext = new LimitExpressionContext(this._ctx, this.state);
		this.enterRule(_localctx, 18, WebdaQLParserParser.RULE_limitExpression);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 118;
			this.match(WebdaQLParserParser.LIMIT);
			this.state = 119;
			this.integerLiteral();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public offsetExpression(): OffsetExpressionContext {
		let _localctx: OffsetExpressionContext = new OffsetExpressionContext(this._ctx, this.state);
		this.enterRule(_localctx, 20, WebdaQLParserParser.RULE_offsetExpression);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 121;
			this.match(WebdaQLParserParser.OFFSET);
			this.state = 122;
			this.stringLiteral();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public orderFieldExpression(): OrderFieldExpressionContext {
		let _localctx: OrderFieldExpressionContext = new OrderFieldExpressionContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, WebdaQLParserParser.RULE_orderFieldExpression);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 124;
			this.identifier();
			this.state = 126;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === WebdaQLParserParser.ASC || _la === WebdaQLParserParser.DESC) {
				{
				this.state = 125;
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
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public orderExpression(): OrderExpressionContext {
		let _localctx: OrderExpressionContext = new OrderExpressionContext(this._ctx, this.state);
		this.enterRule(_localctx, 24, WebdaQLParserParser.RULE_orderExpression);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 128;
			this.match(WebdaQLParserParser.ORDER_BY);
			this.state = 129;
			this.orderFieldExpression();
			this.state = 134;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === WebdaQLParserParser.COMMA) {
				{
				{
				this.state = 130;
				this.match(WebdaQLParserParser.COMMA);
				this.state = 131;
				this.orderFieldExpression();
				}
				}
				this.state = 136;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
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
		let _startState: number = 26;
		this.enterRecursionRule(_localctx, 26, WebdaQLParserParser.RULE_expression, _p);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 159;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 18, this._ctx) ) {
			case 1:
				{
				_localctx = new LikeExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;

				this.state = 138;
				this.identifier();
				this.state = 139;
				this.match(WebdaQLParserParser.LIKE);
				this.state = 140;
				this.stringLiteral();
				}
				break;

			case 2:
				{
				_localctx = new InExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 142;
				this.identifier();
				this.state = 143;
				this.match(WebdaQLParserParser.IN);
				this.state = 144;
				this.setExpression();
				}
				break;

			case 3:
				{
				_localctx = new ContainsExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 146;
				this.identifier();
				this.state = 147;
				this.match(WebdaQLParserParser.CONTAINS);
				this.state = 148;
				this.stringLiteral();
				}
				break;

			case 4:
				{
				_localctx = new BinaryComparisonExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 150;
				this.identifier();
				this.state = 151;
				_la = this._input.LA(1);
				if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << WebdaQLParserParser.EQUAL) | (1 << WebdaQLParserParser.NOT_EQUAL) | (1 << WebdaQLParserParser.GREATER) | (1 << WebdaQLParserParser.GREATER_OR_EQUAL) | (1 << WebdaQLParserParser.LESS) | (1 << WebdaQLParserParser.LESS_OR_EQUAL))) !== 0))) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 152;
				this.values();
				}
				break;

			case 5:
				{
				_localctx = new SubExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 154;
				this.match(WebdaQLParserParser.LR_BRACKET);
				this.state = 155;
				this.expression(0);
				this.state = 156;
				this.match(WebdaQLParserParser.RR_BRACKET);
				}
				break;

			case 6:
				{
				_localctx = new AtomExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 158;
				this.atom();
				}
				break;
			}
			this._ctx._stop = this._input.tryLT(-1);
			this.state = 169;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 20, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					if (this._parseListeners != null) {
						this.triggerExitRuleEvent();
					}
					_prevctx = _localctx;
					{
					this.state = 167;
					this._errHandler.sync(this);
					switch ( this.interpreter.adaptivePredict(this._input, 19, this._ctx) ) {
					case 1:
						{
						_localctx = new AndLogicExpressionContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, WebdaQLParserParser.RULE_expression);
						this.state = 161;
						if (!(this.precpred(this._ctx, 4))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 4)");
						}
						this.state = 162;
						this.match(WebdaQLParserParser.AND);
						this.state = 163;
						this.expression(5);
						}
						break;

					case 2:
						{
						_localctx = new OrLogicExpressionContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, WebdaQLParserParser.RULE_expression);
						this.state = 164;
						if (!(this.precpred(this._ctx, 3))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 3)");
						}
						this.state = 165;
						this.match(WebdaQLParserParser.OR);
						this.state = 166;
						this.expression(4);
						}
						break;
					}
					}
				}
				this.state = 171;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 20, this._ctx);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.unrollRecursionContexts(_parentctx);
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public values(): ValuesContext {
		let _localctx: ValuesContext = new ValuesContext(this._ctx, this.state);
		this.enterRule(_localctx, 28, WebdaQLParserParser.RULE_values);
		try {
			this.state = 175;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case WebdaQLParserParser.TRUE:
			case WebdaQLParserParser.FALSE:
				_localctx = new BooleanAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 172;
				this.booleanLiteral();
				}
				break;
			case WebdaQLParserParser.INTEGER_LITERAL:
				_localctx = new IntegerAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 173;
				this.integerLiteral();
				}
				break;
			case WebdaQLParserParser.DQUOTED_STRING_LITERAL:
			case WebdaQLParserParser.SQUOTED_STRING_LITERAL:
				_localctx = new StringAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 174;
				this.stringLiteral();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public atom(): AtomContext {
		let _localctx: AtomContext = new AtomContext(this._ctx, this.state);
		this.enterRule(_localctx, 30, WebdaQLParserParser.RULE_atom);
		try {
			this.state = 179;
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
				this.state = 177;
				this.values();
				}
				break;
			case WebdaQLParserParser.IDENTIFIER:
			case WebdaQLParserParser.IDENTIFIER_WITH_NUMBER:
				_localctx = new IdentifierAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 178;
				this.identifier();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public identifier(): IdentifierContext {
		let _localctx: IdentifierContext = new IdentifierContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, WebdaQLParserParser.RULE_identifier);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 181;
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
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public booleanLiteral(): BooleanLiteralContext {
		let _localctx: BooleanLiteralContext = new BooleanLiteralContext(this._ctx, this.state);
		this.enterRule(_localctx, 34, WebdaQLParserParser.RULE_booleanLiteral);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 183;
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
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public stringLiteral(): StringLiteralContext {
		let _localctx: StringLiteralContext = new StringLiteralContext(this._ctx, this.state);
		this.enterRule(_localctx, 36, WebdaQLParserParser.RULE_stringLiteral);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 185;
			_la = this._input.LA(1);
			if (!(_la === WebdaQLParserParser.DQUOTED_STRING_LITERAL || _la === WebdaQLParserParser.SQUOTED_STRING_LITERAL)) {
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
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public integerLiteral(): IntegerLiteralContext {
		let _localctx: IntegerLiteralContext = new IntegerLiteralContext(this._ctx, this.state);
		this.enterRule(_localctx, 38, WebdaQLParserParser.RULE_integerLiteral);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 187;
			this.match(WebdaQLParserParser.INTEGER_LITERAL);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public setExpression(): SetExpressionContext {
		let _localctx: SetExpressionContext = new SetExpressionContext(this._ctx, this.state);
		this.enterRule(_localctx, 40, WebdaQLParserParser.RULE_setExpression);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 189;
			this.match(WebdaQLParserParser.LR_SQ_BRACKET);
			this.state = 190;
			this.values();
			this.state = 195;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === WebdaQLParserParser.COMMA) {
				{
				{
				this.state = 191;
				this.match(WebdaQLParserParser.COMMA);
				this.state = 192;
				this.values();
				}
				}
				this.state = 197;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 198;
			this.match(WebdaQLParserParser.RR_SQ_BRACKET);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}

	public sempred(_localctx: RuleContext, ruleIndex: number, predIndex: number): boolean {
		switch (ruleIndex) {
		case 13:
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03\'\xCB\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x03\x02\x03\x02\x05" +
		"\x02/\n\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03\x05\x036\n\x03\x03" +
		"\x04\x03\x04\x03\x04\x05\x04;\n\x04\x03\x04\x05\x04>\n\x04\x03\x05\x03" +
		"\x05\x03\x05\x03\x05\x03\x05\x05\x05E\n\x05\x03\x05\x05\x05H\n\x05\x03" +
		"\x06\x03\x06\x03\x06\x03\x06\x05\x06N\n\x06\x03\x06\x05\x06Q\n\x06\x03" +
		"\x06\x05\x06T\n\x06\x03\x06\x05\x06W\n\x06\x03\x07\x05\x07Z\n\x07\x03" +
		"\x07\x05\x07]\n\x07\x03\x07\x05\x07`\n\x07\x03\x07\x05\x07c\n\x07\x03" +
		"\b\x03\b\x03\b\x07\bh\n\b\f\b\x0E\bk\v\b\x03\t\x03\t\x03\t\x03\t\x03\n" +
		"\x03\n\x03\n\x07\nt\n\n\f\n\x0E\nw\v\n\x03\v\x03\v\x03\v\x03\f\x03\f\x03" +
		"\f\x03\r\x03\r\x05\r\x81\n\r\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x07\x0E\x87" +
		"\n\x0E\f\x0E\x0E\x0E\x8A\v\x0E\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x05\x0F" +
		"\xA2\n\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x07\x0F\xAA" +
		"\n\x0F\f\x0F\x0E\x0F\xAD\v\x0F\x03\x10\x03\x10\x03\x10\x05\x10\xB2\n\x10" +
		"\x03\x11\x03\x11\x05\x11\xB6\n\x11\x03\x12\x03\x12\x03\x13\x03\x13\x03" +
		"\x14\x03\x14\x03\x15\x03\x15\x03\x16\x03\x16\x03\x16\x03\x16\x07\x16\xC4" +
		"\n\x16\f\x16\x0E\x16\xC7\v\x16\x03\x16\x03\x16\x03\x16\x02\x02\x03\x1C" +
		"\x17\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12\x02" +
		"\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02$\x02&\x02" +
		"(\x02*\x02\x02\x07\x03\x02 !\x03\x02\x12\x17\x03\x02%&\x03\x02\x1B\x1C" +
		"\x03\x02\"#\x02\xD3\x02.\x03\x02\x02\x02\x045\x03\x02\x02\x02\x067\x03" +
		"\x02\x02\x02\b?\x03\x02\x02\x02\nI\x03\x02\x02\x02\fY\x03\x02\x02\x02" +
		"\x0Ed\x03\x02\x02\x02\x10l\x03\x02\x02\x02\x12p\x03\x02\x02\x02\x14x\x03" +
		"\x02\x02\x02\x16{\x03\x02\x02\x02\x18~\x03\x02\x02\x02\x1A\x82\x03\x02" +
		"\x02\x02\x1C\xA1\x03\x02\x02\x02\x1E\xB1\x03\x02\x02\x02 \xB5\x03\x02" +
		"\x02\x02\"\xB7\x03\x02\x02\x02$\xB9\x03\x02\x02\x02&\xBB\x03\x02\x02\x02" +
		"(\xBD\x03\x02\x02\x02*\xBF\x03\x02\x02\x02,/\x05\x04\x03\x02-/\x05\f\x07" +
		"\x02.,\x03\x02\x02\x02.-\x03\x02\x02\x02/0\x03\x02\x02\x0201\x07\x02\x02" +
		"\x031\x03\x03\x02\x02\x0226\x05\x06\x04\x0236\x05\b\x05\x0246\x05\n\x06" +
		"\x0252\x03\x02\x02\x0253\x03\x02\x02\x0254\x03\x02\x02\x026\x05\x03\x02" +
		"\x02\x027:\x07\v\x02\x0289\x07\x0F\x02\x029;\x05\x1C\x0F\x02:8\x03\x02" +
		"\x02\x02:;\x03\x02\x02\x02;=\x03\x02\x02\x02<>\x05\x14\v\x02=<\x03\x02" +
		"\x02\x02=>\x03\x02\x02\x02>\x07\x03\x02\x02\x02?@\x07\f\x02\x02@A\x07" +
		"\x0E\x02\x02AD\x05\x0E\b\x02BC\x07\x0F\x02\x02CE\x05\x1C\x0F\x02DB\x03" +
		"\x02\x02\x02DE\x03\x02\x02\x02EG\x03\x02\x02\x02FH\x05\x14\v\x02GF\x03" +
		"\x02\x02\x02GH\x03\x02\x02\x02H\t\x03\x02\x02\x02IJ\x07\r\x02\x02JM\x05" +
		"\x12\n\x02KL\x07\x0F\x02\x02LN\x05\x1C\x0F\x02MK\x03\x02\x02\x02MN\x03" +
		"\x02\x02\x02NP\x03\x02\x02\x02OQ\x05\x1A\x0E\x02PO\x03\x02\x02\x02PQ\x03" +
		"\x02\x02\x02QS\x03\x02\x02\x02RT\x05\x14\v\x02SR\x03\x02\x02\x02ST\x03" +
		"\x02\x02\x02TV\x03\x02\x02\x02UW\x05\x16\f\x02VU\x03\x02\x02\x02VW\x03" +
		"\x02\x02\x02W\v\x03\x02\x02\x02XZ\x05\x1C\x0F\x02YX\x03\x02\x02\x02YZ" +
		"\x03\x02\x02\x02Z\\\x03\x02\x02\x02[]\x05\x1A\x0E\x02\\[\x03\x02\x02\x02" +
		"\\]\x03\x02\x02\x02]_\x03\x02\x02\x02^`\x05\x14\v\x02_^\x03\x02\x02\x02" +
		"_`\x03\x02\x02\x02`b\x03\x02\x02\x02ac\x05\x16\f\x02ba\x03\x02\x02\x02" +
		"bc\x03\x02\x02\x02c\r\x03\x02\x02\x02di\x05\x10\t\x02ef\x07\x06\x02\x02" +
		"fh\x05\x10\t\x02ge\x03\x02\x02\x02hk\x03\x02\x02\x02ig\x03\x02\x02\x02" +
		"ij\x03\x02\x02\x02j\x0F\x03\x02\x02\x02ki\x03\x02\x02\x02lm\x05\"\x12" +
		"\x02mn\x07\x12\x02\x02no\x05\x1E\x10\x02o\x11\x03\x02\x02\x02pu\x05\"" +
		"\x12\x02qr\x07\x06\x02\x02rt\x05\"\x12\x02sq\x03\x02\x02\x02tw\x03\x02" +
		"\x02\x02us\x03\x02\x02\x02uv\x03\x02\x02\x02v\x13\x03\x02\x02\x02wu\x03" +
		"\x02\x02\x02xy\x07\x1D\x02\x02yz\x05(\x15\x02z\x15\x03\x02\x02\x02{|\x07" +
		"\x1E\x02\x02|}\x05&\x14\x02}\x17\x03\x02\x02\x02~\x80\x05\"\x12\x02\x7F" +
		"\x81\t\x02\x02\x02\x80\x7F\x03\x02\x02\x02\x80\x81\x03\x02\x02\x02\x81" +
		"\x19\x03\x02\x02\x02\x82\x83\x07\x1F\x02\x02\x83\x88\x05\x18\r\x02\x84" +
		"\x85\x07\x06\x02\x02\x85\x87\x05\x18\r\x02\x86\x84\x03\x02\x02\x02\x87" +
		"\x8A\x03\x02\x02\x02\x88\x86\x03\x02\x02\x02\x88\x89\x03\x02\x02\x02\x89" +
		"\x1B\x03\x02\x02\x02\x8A\x88\x03\x02\x02\x02\x8B\x8C\b\x0F\x01\x02\x8C" +
		"\x8D\x05\"\x12\x02\x8D\x8E\x07\x18\x02\x02\x8E\x8F\x05&\x14\x02\x8F\xA2" +
		"\x03\x02\x02\x02\x90\x91\x05\"\x12\x02\x91\x92\x07\x19\x02\x02\x92\x93" +
		"\x05*\x16\x02\x93\xA2\x03\x02\x02\x02\x94\x95\x05\"\x12\x02\x95\x96\x07" +
		"\x1A\x02\x02\x96\x97\x05&\x14\x02\x97\xA2\x03\x02\x02\x02\x98\x99\x05" +
		"\"\x12\x02\x99\x9A\t\x03\x02\x02\x9A\x9B\x05\x1E\x10\x02\x9B\xA2\x03\x02" +
		"\x02\x02\x9C\x9D\x07\x04\x02\x02\x9D\x9E\x05\x1C\x0F\x02\x9E\x9F\x07\x05" +
		"\x02\x02\x9F\xA2\x03\x02\x02\x02\xA0\xA2\x05 \x11\x02\xA1\x8B\x03\x02" +
		"\x02\x02\xA1\x90\x03\x02\x02\x02\xA1\x94\x03\x02\x02\x02\xA1\x98\x03\x02" +
		"\x02\x02\xA1\x9C\x03\x02\x02\x02\xA1\xA0\x03\x02\x02\x02\xA2\xAB\x03\x02" +
		"\x02\x02\xA3\xA4\f\x06\x02\x02\xA4\xA5\x07\x10\x02\x02\xA5\xAA\x05\x1C" +
		"\x0F\x07\xA6\xA7\f\x05\x02\x02\xA7\xA8\x07\x11\x02\x02\xA8\xAA\x05\x1C" +
		"\x0F\x06\xA9\xA3\x03\x02\x02\x02\xA9\xA6\x03\x02\x02\x02\xAA\xAD\x03\x02" +
		"\x02\x02\xAB\xA9\x03\x02\x02\x02\xAB\xAC\x03\x02\x02\x02\xAC\x1D\x03\x02" +
		"\x02\x02\xAD\xAB\x03\x02\x02\x02\xAE\xB2\x05$\x13\x02\xAF\xB2\x05(\x15" +
		"\x02\xB0\xB2\x05&\x14\x02\xB1\xAE\x03\x02\x02\x02\xB1\xAF\x03\x02\x02" +
		"\x02\xB1\xB0\x03\x02\x02\x02\xB2\x1F\x03\x02\x02\x02\xB3\xB6\x05\x1E\x10" +
		"\x02\xB4\xB6\x05\"\x12\x02\xB5\xB3\x03\x02\x02\x02\xB5\xB4\x03\x02\x02" +
		"\x02\xB6!\x03\x02\x02\x02\xB7\xB8\t\x04\x02\x02\xB8#\x03\x02\x02\x02\xB9" +
		"\xBA\t\x05\x02\x02\xBA%\x03\x02\x02\x02\xBB\xBC\t\x06\x02\x02\xBC\'\x03" +
		"\x02\x02\x02\xBD\xBE\x07$\x02\x02\xBE)\x03\x02\x02\x02\xBF\xC0\x07\t\x02" +
		"\x02\xC0\xC5\x05\x1E\x10\x02\xC1\xC2\x07\x06\x02\x02\xC2\xC4\x05\x1E\x10" +
		"\x02\xC3\xC1\x03\x02\x02\x02\xC4\xC7\x03\x02\x02\x02\xC5\xC3\x03\x02\x02" +
		"\x02\xC5\xC6\x03\x02\x02\x02\xC6\xC8\x03\x02\x02\x02\xC7\xC5\x03\x02\x02" +
		"\x02\xC8\xC9\x07\n\x02\x02\xC9+\x03\x02\x02\x02\x1A.5:=DGMPSVY\\_biu\x80" +
		"\x88\xA1\xA9\xAB\xB1\xB5\xC5";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!WebdaQLParserParser.__ATN) {
			WebdaQLParserParser.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(WebdaQLParserParser._serializedATN));
		}

		return WebdaQLParserParser.__ATN;
	}

}

export class WebdaqlContext extends ParserRuleContext {
	public EOF(): TerminalNode { return this.getToken(WebdaQLParserParser.EOF, 0); }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_webdaql; }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_statement; }
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
	public DELETE(): TerminalNode { return this.getToken(WebdaQLParserParser.DELETE, 0); }
	public WHERE(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.WHERE, 0); }
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	public limitExpression(): LimitExpressionContext | undefined {
		return this.tryGetRuleContext(0, LimitExpressionContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_deleteStatement; }
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
	public UPDATE(): TerminalNode { return this.getToken(WebdaQLParserParser.UPDATE, 0); }
	public SET(): TerminalNode { return this.getToken(WebdaQLParserParser.SET, 0); }
	public assignmentList(): AssignmentListContext {
		return this.getRuleContext(0, AssignmentListContext);
	}
	public WHERE(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.WHERE, 0); }
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	public limitExpression(): LimitExpressionContext | undefined {
		return this.tryGetRuleContext(0, LimitExpressionContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_updateStatement; }
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
	public SELECT(): TerminalNode { return this.getToken(WebdaQLParserParser.SELECT, 0); }
	public fieldList(): FieldListContext {
		return this.getRuleContext(0, FieldListContext);
	}
	public WHERE(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.WHERE, 0); }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_selectStatement; }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_filterQuery; }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_assignmentList; }
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
	public EQUAL(): TerminalNode { return this.getToken(WebdaQLParserParser.EQUAL, 0); }
	public values(): ValuesContext {
		return this.getRuleContext(0, ValuesContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_assignment; }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_fieldList; }
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
	public LIMIT(): TerminalNode { return this.getToken(WebdaQLParserParser.LIMIT, 0); }
	public integerLiteral(): IntegerLiteralContext {
		return this.getRuleContext(0, IntegerLiteralContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_limitExpression; }
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
	public OFFSET(): TerminalNode { return this.getToken(WebdaQLParserParser.OFFSET, 0); }
	public stringLiteral(): StringLiteralContext {
		return this.getRuleContext(0, StringLiteralContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_offsetExpression; }
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
	public ASC(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.ASC, 0); }
	public DESC(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.DESC, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_orderFieldExpression; }
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
	public ORDER_BY(): TerminalNode { return this.getToken(WebdaQLParserParser.ORDER_BY, 0); }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_orderExpression; }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_expression; }
	public copyFrom(ctx: ExpressionContext): void {
		super.copyFrom(ctx);
	}
}
export class LikeExpressionContext extends ExpressionContext {
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	public LIKE(): TerminalNode { return this.getToken(WebdaQLParserParser.LIKE, 0); }
	public stringLiteral(): StringLiteralContext {
		return this.getRuleContext(0, StringLiteralContext);
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
	public IN(): TerminalNode { return this.getToken(WebdaQLParserParser.IN, 0); }
	public setExpression(): SetExpressionContext {
		return this.getRuleContext(0, SetExpressionContext);
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
	public CONTAINS(): TerminalNode { return this.getToken(WebdaQLParserParser.CONTAINS, 0); }
	public stringLiteral(): StringLiteralContext {
		return this.getRuleContext(0, StringLiteralContext);
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
export class BinaryComparisonExpressionContext extends ExpressionContext {
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	public values(): ValuesContext {
		return this.getRuleContext(0, ValuesContext);
	}
	public EQUAL(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.EQUAL, 0); }
	public NOT_EQUAL(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.NOT_EQUAL, 0); }
	public GREATER_OR_EQUAL(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.GREATER_OR_EQUAL, 0); }
	public LESS_OR_EQUAL(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.LESS_OR_EQUAL, 0); }
	public LESS(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.LESS, 0); }
	public GREATER(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.GREATER, 0); }
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
	public AND(): TerminalNode { return this.getToken(WebdaQLParserParser.AND, 0); }
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
	public OR(): TerminalNode { return this.getToken(WebdaQLParserParser.OR, 0); }
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
	public LR_BRACKET(): TerminalNode { return this.getToken(WebdaQLParserParser.LR_BRACKET, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RR_BRACKET(): TerminalNode { return this.getToken(WebdaQLParserParser.RR_BRACKET, 0); }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_values; }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_atom; }
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
	public IDENTIFIER(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.IDENTIFIER, 0); }
	public IDENTIFIER_WITH_NUMBER(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.IDENTIFIER_WITH_NUMBER, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_identifier; }
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
	public TRUE(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.TRUE, 0); }
	public FALSE(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.FALSE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_booleanLiteral; }
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
	public DQUOTED_STRING_LITERAL(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.DQUOTED_STRING_LITERAL, 0); }
	public SQUOTED_STRING_LITERAL(): TerminalNode | undefined { return this.tryGetToken(WebdaQLParserParser.SQUOTED_STRING_LITERAL, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_stringLiteral; }
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
	public INTEGER_LITERAL(): TerminalNode { return this.getToken(WebdaQLParserParser.INTEGER_LITERAL, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_integerLiteral; }
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


export class SetExpressionContext extends ParserRuleContext {
	public LR_SQ_BRACKET(): TerminalNode { return this.getToken(WebdaQLParserParser.LR_SQ_BRACKET, 0); }
	public values(): ValuesContext[];
	public values(i: number): ValuesContext;
	public values(i?: number): ValuesContext | ValuesContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ValuesContext);
		} else {
			return this.getRuleContext(i, ValuesContext);
		}
	}
	public RR_SQ_BRACKET(): TerminalNode { return this.getToken(WebdaQLParserParser.RR_SQ_BRACKET, 0); }
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
	public get ruleIndex(): number { return WebdaQLParserParser.RULE_setExpression; }
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



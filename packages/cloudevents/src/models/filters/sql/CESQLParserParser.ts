// Generated from src/models/filters/sql/CESQLParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ATN } from "antlr4ts/atn/ATN";
import { ATNDeserializer } from "antlr4ts/atn/ATNDeserializer";
import { FailedPredicateException } from "antlr4ts/FailedPredicateException";
import { NotNull } from "antlr4ts/Decorators";
import { NoViableAltException } from "antlr4ts/NoViableAltException";
import { Override } from "antlr4ts/Decorators";
import { Parser } from "antlr4ts/Parser";
import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { ParserATNSimulator } from "antlr4ts/atn/ParserATNSimulator";
import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";
import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";
import { RecognitionException } from "antlr4ts/RecognitionException";
import { RuleContext } from "antlr4ts/RuleContext";
//import { RuleVersion } from "antlr4ts/RuleVersion";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { Token } from "antlr4ts/Token";
import { TokenStream } from "antlr4ts/TokenStream";
import { Vocabulary } from "antlr4ts/Vocabulary";
import { VocabularyImpl } from "antlr4ts/VocabularyImpl";

import * as Utils from "antlr4ts/misc/Utils";

import { CESQLParserListener } from "./CESQLParserListener";
import { CESQLParserVisitor } from "./CESQLParserVisitor";


export class CESQLParserParser extends Parser {
	public static readonly SPACE = 1;
	public static readonly LR_BRACKET = 2;
	public static readonly RR_BRACKET = 3;
	public static readonly COMMA = 4;
	public static readonly SINGLE_QUOTE_SYMB = 5;
	public static readonly DOUBLE_QUOTE_SYMB = 6;
	public static readonly AND = 7;
	public static readonly OR = 8;
	public static readonly XOR = 9;
	public static readonly NOT = 10;
	public static readonly STAR = 11;
	public static readonly DIVIDE = 12;
	public static readonly MODULE = 13;
	public static readonly PLUS = 14;
	public static readonly MINUS = 15;
	public static readonly EQUAL = 16;
	public static readonly NOT_EQUAL = 17;
	public static readonly GREATER = 18;
	public static readonly GREATER_OR_EQUAL = 19;
	public static readonly LESS = 20;
	public static readonly LESS_GREATER = 21;
	public static readonly LESS_OR_EQUAL = 22;
	public static readonly LIKE = 23;
	public static readonly EXISTS = 24;
	public static readonly IN = 25;
	public static readonly TRUE = 26;
	public static readonly FALSE = 27;
	public static readonly DQUOTED_STRING_LITERAL = 28;
	public static readonly SQUOTED_STRING_LITERAL = 29;
	public static readonly INTEGER_LITERAL = 30;
	public static readonly IDENTIFIER = 31;
	public static readonly IDENTIFIER_WITH_NUMBER = 32;
	public static readonly FUNCTION_IDENTIFIER_WITH_UNDERSCORE = 33;
	public static readonly RULE_cesql = 0;
	public static readonly RULE_expression = 1;
	public static readonly RULE_atom = 2;
	public static readonly RULE_identifier = 3;
	public static readonly RULE_functionIdentifier = 4;
	public static readonly RULE_booleanLiteral = 5;
	public static readonly RULE_stringLiteral = 6;
	public static readonly RULE_integerLiteral = 7;
	public static readonly RULE_functionParameterList = 8;
	public static readonly RULE_setExpression = 9;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"cesql", "expression", "atom", "identifier", "functionIdentifier", "booleanLiteral", 
		"stringLiteral", "integerLiteral", "functionParameterList", "setExpression",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, undefined, "'('", "')'", "','", "'''", "'\"'", "'AND'", "'OR'", 
		"'XOR'", "'NOT'", "'*'", "'/'", "'%'", "'+'", "'-'", "'='", "'!='", "'>'", 
		"'>='", "'<'", "'<>'", "'<='", "'LIKE'", "'EXISTS'", "'IN'", "'TRUE'", 
		"'FALSE'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "SPACE", "LR_BRACKET", "RR_BRACKET", "COMMA", "SINGLE_QUOTE_SYMB", 
		"DOUBLE_QUOTE_SYMB", "AND", "OR", "XOR", "NOT", "STAR", "DIVIDE", "MODULE", 
		"PLUS", "MINUS", "EQUAL", "NOT_EQUAL", "GREATER", "GREATER_OR_EQUAL", 
		"LESS", "LESS_GREATER", "LESS_OR_EQUAL", "LIKE", "EXISTS", "IN", "TRUE", 
		"FALSE", "DQUOTED_STRING_LITERAL", "SQUOTED_STRING_LITERAL", "INTEGER_LITERAL", 
		"IDENTIFIER", "IDENTIFIER_WITH_NUMBER", "FUNCTION_IDENTIFIER_WITH_UNDERSCORE",
	];
	public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(CESQLParserParser._LITERAL_NAMES, CESQLParserParser._SYMBOLIC_NAMES, []);

	// @Override
	// @NotNull
	public get vocabulary(): Vocabulary {
		return CESQLParserParser.VOCABULARY;
	}
	// tslint:enable:no-trailing-whitespace

	// @Override
	public get grammarFileName(): string { return "CESQLParser.g4"; }

	// @Override
	public get ruleNames(): string[] { return CESQLParserParser.ruleNames; }

	// @Override
	public get serializedATN(): string { return CESQLParserParser._serializedATN; }

	protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException {
		return new FailedPredicateException(this, predicate, message);
	}

	constructor(input: TokenStream) {
		super(input);
		this._interp = new ParserATNSimulator(CESQLParserParser._ATN, this);
	}
	// @RuleVersion(0)
	public cesql(): CesqlContext {
		let _localctx: CesqlContext = new CesqlContext(this._ctx, this.state);
		this.enterRule(_localctx, 0, CESQLParserParser.RULE_cesql);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 20;
			this.expression(0);
			this.state = 21;
			this.match(CESQLParserParser.EOF);
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
		let _startState: number = 2;
		this.enterRecursionRule(_localctx, 2, CESQLParserParser.RULE_expression, _p);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 38;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 0, this._ctx) ) {
			case 1:
				{
				_localctx = new FunctionInvocationExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;

				this.state = 24;
				this.functionIdentifier();
				this.state = 25;
				this.functionParameterList();
				}
				break;

			case 2:
				{
				_localctx = new UnaryLogicExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 27;
				this.match(CESQLParserParser.NOT);
				this.state = 28;
				this.expression(11);
				}
				break;

			case 3:
				{
				_localctx = new UnaryNumericExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 29;
				this.match(CESQLParserParser.MINUS);
				this.state = 30;
				this.expression(10);
				}
				break;

			case 4:
				{
				_localctx = new ExistsExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 31;
				this.match(CESQLParserParser.EXISTS);
				this.state = 32;
				this.identifier();
				}
				break;

			case 5:
				{
				_localctx = new SubExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 33;
				this.match(CESQLParserParser.LR_BRACKET);
				this.state = 34;
				this.expression(0);
				this.state = 35;
				this.match(CESQLParserParser.RR_BRACKET);
				}
				break;

			case 6:
				{
				_localctx = new AtomExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 37;
				this.atom();
				}
				break;
			}
			this._ctx._stop = this._input.tryLT(-1);
			this.state = 66;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 4, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					if (this._parseListeners != null) {
						this.triggerExitRuleEvent();
					}
					_prevctx = _localctx;
					{
					this.state = 64;
					this._errHandler.sync(this);
					switch ( this.interpreter.adaptivePredict(this._input, 3, this._ctx) ) {
					case 1:
						{
						_localctx = new BinaryMultiplicativeExpressionContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, CESQLParserParser.RULE_expression);
						this.state = 40;
						if (!(this.precpred(this._ctx, 6))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 6)");
						}
						this.state = 41;
						_la = this._input.LA(1);
						if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CESQLParserParser.STAR) | (1 << CESQLParserParser.DIVIDE) | (1 << CESQLParserParser.MODULE))) !== 0))) {
						this._errHandler.recoverInline(this);
						} else {
							if (this._input.LA(1) === Token.EOF) {
								this.matchedEOF = true;
							}

							this._errHandler.reportMatch(this);
							this.consume();
						}
						this.state = 42;
						this.expression(7);
						}
						break;

					case 2:
						{
						_localctx = new BinaryAdditiveExpressionContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, CESQLParserParser.RULE_expression);
						this.state = 43;
						if (!(this.precpred(this._ctx, 5))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 5)");
						}
						this.state = 44;
						_la = this._input.LA(1);
						if (!(_la === CESQLParserParser.PLUS || _la === CESQLParserParser.MINUS)) {
						this._errHandler.recoverInline(this);
						} else {
							if (this._input.LA(1) === Token.EOF) {
								this.matchedEOF = true;
							}

							this._errHandler.reportMatch(this);
							this.consume();
						}
						this.state = 45;
						this.expression(6);
						}
						break;

					case 3:
						{
						_localctx = new BinaryComparisonExpressionContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, CESQLParserParser.RULE_expression);
						this.state = 46;
						if (!(this.precpred(this._ctx, 4))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 4)");
						}
						this.state = 47;
						_la = this._input.LA(1);
						if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CESQLParserParser.EQUAL) | (1 << CESQLParserParser.NOT_EQUAL) | (1 << CESQLParserParser.GREATER) | (1 << CESQLParserParser.GREATER_OR_EQUAL) | (1 << CESQLParserParser.LESS) | (1 << CESQLParserParser.LESS_GREATER) | (1 << CESQLParserParser.LESS_OR_EQUAL))) !== 0))) {
						this._errHandler.recoverInline(this);
						} else {
							if (this._input.LA(1) === Token.EOF) {
								this.matchedEOF = true;
							}

							this._errHandler.reportMatch(this);
							this.consume();
						}
						this.state = 48;
						this.expression(5);
						}
						break;

					case 4:
						{
						_localctx = new BinaryLogicExpressionContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, CESQLParserParser.RULE_expression);
						this.state = 49;
						if (!(this.precpred(this._ctx, 3))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 3)");
						}
						this.state = 50;
						_la = this._input.LA(1);
						if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CESQLParserParser.AND) | (1 << CESQLParserParser.OR) | (1 << CESQLParserParser.XOR))) !== 0))) {
						this._errHandler.recoverInline(this);
						} else {
							if (this._input.LA(1) === Token.EOF) {
								this.matchedEOF = true;
							}

							this._errHandler.reportMatch(this);
							this.consume();
						}
						this.state = 51;
						this.expression(3);
						}
						break;

					case 5:
						{
						_localctx = new LikeExpressionContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, CESQLParserParser.RULE_expression);
						this.state = 52;
						if (!(this.precpred(this._ctx, 9))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 9)");
						}
						this.state = 54;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
						if (_la === CESQLParserParser.NOT) {
							{
							this.state = 53;
							this.match(CESQLParserParser.NOT);
							}
						}

						this.state = 56;
						this.match(CESQLParserParser.LIKE);
						this.state = 57;
						this.stringLiteral();
						}
						break;

					case 6:
						{
						_localctx = new InExpressionContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, CESQLParserParser.RULE_expression);
						this.state = 58;
						if (!(this.precpred(this._ctx, 7))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 7)");
						}
						this.state = 60;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
						if (_la === CESQLParserParser.NOT) {
							{
							this.state = 59;
							this.match(CESQLParserParser.NOT);
							}
						}

						this.state = 62;
						this.match(CESQLParserParser.IN);
						this.state = 63;
						this.setExpression();
						}
						break;
					}
					}
				}
				this.state = 68;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 4, this._ctx);
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
	public atom(): AtomContext {
		let _localctx: AtomContext = new AtomContext(this._ctx, this.state);
		this.enterRule(_localctx, 4, CESQLParserParser.RULE_atom);
		try {
			this.state = 73;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CESQLParserParser.TRUE:
			case CESQLParserParser.FALSE:
				_localctx = new BooleanAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 69;
				this.booleanLiteral();
				}
				break;
			case CESQLParserParser.INTEGER_LITERAL:
				_localctx = new IntegerAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 70;
				this.integerLiteral();
				}
				break;
			case CESQLParserParser.DQUOTED_STRING_LITERAL:
			case CESQLParserParser.SQUOTED_STRING_LITERAL:
				_localctx = new StringAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 71;
				this.stringLiteral();
				}
				break;
			case CESQLParserParser.IDENTIFIER:
			case CESQLParserParser.IDENTIFIER_WITH_NUMBER:
				_localctx = new IdentifierAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 72;
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
		this.enterRule(_localctx, 6, CESQLParserParser.RULE_identifier);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 75;
			_la = this._input.LA(1);
			if (!(_la === CESQLParserParser.IDENTIFIER || _la === CESQLParserParser.IDENTIFIER_WITH_NUMBER)) {
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
	public functionIdentifier(): FunctionIdentifierContext {
		let _localctx: FunctionIdentifierContext = new FunctionIdentifierContext(this._ctx, this.state);
		this.enterRule(_localctx, 8, CESQLParserParser.RULE_functionIdentifier);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 77;
			_la = this._input.LA(1);
			if (!(_la === CESQLParserParser.IDENTIFIER || _la === CESQLParserParser.FUNCTION_IDENTIFIER_WITH_UNDERSCORE)) {
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
		this.enterRule(_localctx, 10, CESQLParserParser.RULE_booleanLiteral);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 79;
			_la = this._input.LA(1);
			if (!(_la === CESQLParserParser.TRUE || _la === CESQLParserParser.FALSE)) {
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
		this.enterRule(_localctx, 12, CESQLParserParser.RULE_stringLiteral);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 81;
			_la = this._input.LA(1);
			if (!(_la === CESQLParserParser.DQUOTED_STRING_LITERAL || _la === CESQLParserParser.SQUOTED_STRING_LITERAL)) {
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
		this.enterRule(_localctx, 14, CESQLParserParser.RULE_integerLiteral);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 83;
			this.match(CESQLParserParser.INTEGER_LITERAL);
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
	public functionParameterList(): FunctionParameterListContext {
		let _localctx: FunctionParameterListContext = new FunctionParameterListContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, CESQLParserParser.RULE_functionParameterList);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 85;
			this.match(CESQLParserParser.LR_BRACKET);
			this.state = 94;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 2)) & ~0x1F) === 0 && ((1 << (_la - 2)) & ((1 << (CESQLParserParser.LR_BRACKET - 2)) | (1 << (CESQLParserParser.NOT - 2)) | (1 << (CESQLParserParser.MINUS - 2)) | (1 << (CESQLParserParser.EXISTS - 2)) | (1 << (CESQLParserParser.TRUE - 2)) | (1 << (CESQLParserParser.FALSE - 2)) | (1 << (CESQLParserParser.DQUOTED_STRING_LITERAL - 2)) | (1 << (CESQLParserParser.SQUOTED_STRING_LITERAL - 2)) | (1 << (CESQLParserParser.INTEGER_LITERAL - 2)) | (1 << (CESQLParserParser.IDENTIFIER - 2)) | (1 << (CESQLParserParser.IDENTIFIER_WITH_NUMBER - 2)) | (1 << (CESQLParserParser.FUNCTION_IDENTIFIER_WITH_UNDERSCORE - 2)))) !== 0)) {
				{
				this.state = 86;
				this.expression(0);
				this.state = 91;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === CESQLParserParser.COMMA) {
					{
					{
					this.state = 87;
					this.match(CESQLParserParser.COMMA);
					this.state = 88;
					this.expression(0);
					}
					}
					this.state = 93;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
			}

			this.state = 96;
			this.match(CESQLParserParser.RR_BRACKET);
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
		this.enterRule(_localctx, 18, CESQLParserParser.RULE_setExpression);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 98;
			this.match(CESQLParserParser.LR_BRACKET);
			this.state = 99;
			this.expression(0);
			this.state = 104;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === CESQLParserParser.COMMA) {
				{
				{
				this.state = 100;
				this.match(CESQLParserParser.COMMA);
				this.state = 101;
				this.expression(0);
				}
				}
				this.state = 106;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 107;
			this.match(CESQLParserParser.RR_BRACKET);
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
		case 1:
			return this.expression_sempred(_localctx as ExpressionContext, predIndex);
		}
		return true;
	}
	private expression_sempred(_localctx: ExpressionContext, predIndex: number): boolean {
		switch (predIndex) {
		case 0:
			return this.precpred(this._ctx, 6);

		case 1:
			return this.precpred(this._ctx, 5);

		case 2:
			return this.precpred(this._ctx, 4);

		case 3:
			return this.precpred(this._ctx, 3);

		case 4:
			return this.precpred(this._ctx, 9);

		case 5:
			return this.precpred(this._ctx, 7);
		}
		return true;
	}

	public static readonly _serializedATN: string =
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03#p\x04\x02\t\x02" +
		"\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07\t\x07" +
		"\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x03\x02\x03\x02\x03\x02\x03\x03" +
		"\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03" +
		"\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x05\x03)\n\x03\x03\x03\x03\x03" +
		"\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03" +
		"\x03\x03\x03\x03\x03\x03\x05\x039\n\x03\x03\x03\x03\x03\x03\x03\x03\x03" +
		"\x05\x03?\n\x03\x03\x03\x03\x03\x07\x03C\n\x03\f\x03\x0E\x03F\v\x03\x03" +
		"\x04\x03\x04\x03\x04\x03\x04\x05\x04L\n\x04\x03\x05\x03\x05\x03\x06\x03" +
		"\x06\x03\x07\x03\x07\x03\b\x03\b\x03\t\x03\t\x03\n\x03\n\x03\n\x03\n\x07" +
		"\n\\\n\n\f\n\x0E\n_\v\n\x05\na\n\n\x03\n\x03\n\x03\v\x03\v\x03\v\x03\v" +
		"\x07\vi\n\v\f\v\x0E\vl\v\v\x03\v\x03\v\x03\v\x02\x02\x03\x04\f\x02\x02" +
		"\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x02" +
		"\n\x03\x02\r\x0F\x03\x02\x10\x11\x03\x02\x12\x18\x03\x02\t\v\x03\x02!" +
		"\"\x04\x02!!##\x03\x02\x1C\x1D\x03\x02\x1E\x1F\x02x\x02\x16\x03\x02\x02" +
		"\x02\x04(\x03\x02\x02\x02\x06K\x03\x02\x02\x02\bM\x03\x02\x02\x02\nO\x03" +
		"\x02\x02\x02\fQ\x03\x02\x02\x02\x0ES\x03\x02\x02\x02\x10U\x03\x02\x02" +
		"\x02\x12W\x03\x02\x02\x02\x14d\x03\x02\x02\x02\x16\x17\x05\x04\x03\x02" +
		"\x17\x18\x07\x02\x02\x03\x18\x03\x03\x02\x02\x02\x19\x1A\b\x03\x01\x02" +
		"\x1A\x1B\x05\n\x06\x02\x1B\x1C\x05\x12\n\x02\x1C)\x03\x02\x02\x02\x1D" +
		"\x1E\x07\f\x02\x02\x1E)\x05\x04\x03\r\x1F \x07\x11\x02\x02 )\x05\x04\x03" +
		"\f!\"\x07\x1A\x02\x02\")\x05\b\x05\x02#$\x07\x04\x02\x02$%\x05\x04\x03" +
		"\x02%&\x07\x05\x02\x02&)\x03\x02\x02\x02\')\x05\x06\x04\x02(\x19\x03\x02" +
		"\x02\x02(\x1D\x03\x02\x02\x02(\x1F\x03\x02\x02\x02(!\x03\x02\x02\x02(" +
		"#\x03\x02\x02\x02(\'\x03\x02\x02\x02)D\x03\x02\x02\x02*+\f\b\x02\x02+" +
		",\t\x02\x02\x02,C\x05\x04\x03\t-.\f\x07\x02\x02./\t\x03\x02\x02/C\x05" +
		"\x04\x03\b01\f\x06\x02\x0212\t\x04\x02\x022C\x05\x04\x03\x0734\f\x05\x02" +
		"\x0245\t\x05\x02\x025C\x05\x04\x03\x0568\f\v\x02\x0279\x07\f\x02\x028" +
		"7\x03\x02\x02\x0289\x03\x02\x02\x029:\x03\x02\x02\x02:;\x07\x19\x02\x02" +
		";C\x05\x0E\b\x02<>\f\t\x02\x02=?\x07\f\x02\x02>=\x03\x02\x02\x02>?\x03" +
		"\x02\x02\x02?@\x03\x02\x02\x02@A\x07\x1B\x02\x02AC\x05\x14\v\x02B*\x03" +
		"\x02\x02\x02B-\x03\x02\x02\x02B0\x03\x02\x02\x02B3\x03\x02\x02\x02B6\x03" +
		"\x02\x02\x02B<\x03\x02\x02\x02CF\x03\x02\x02\x02DB\x03\x02\x02\x02DE\x03" +
		"\x02\x02\x02E\x05\x03\x02\x02\x02FD\x03\x02\x02\x02GL\x05\f\x07\x02HL" +
		"\x05\x10\t\x02IL\x05\x0E\b\x02JL\x05\b\x05\x02KG\x03\x02\x02\x02KH\x03" +
		"\x02\x02\x02KI\x03\x02\x02\x02KJ\x03\x02\x02\x02L\x07\x03\x02\x02\x02" +
		"MN\t\x06\x02\x02N\t\x03\x02\x02\x02OP\t\x07\x02\x02P\v\x03\x02\x02\x02" +
		"QR\t\b\x02\x02R\r\x03\x02\x02\x02ST\t\t\x02\x02T\x0F\x03\x02\x02\x02U" +
		"V\x07 \x02\x02V\x11\x03\x02\x02\x02W`\x07\x04\x02\x02X]\x05\x04\x03\x02" +
		"YZ\x07\x06\x02\x02Z\\\x05\x04\x03\x02[Y\x03\x02\x02\x02\\_\x03\x02\x02" +
		"\x02][\x03\x02\x02\x02]^\x03\x02\x02\x02^a\x03\x02\x02\x02_]\x03\x02\x02" +
		"\x02`X\x03\x02\x02\x02`a\x03\x02\x02\x02ab\x03\x02\x02\x02bc\x07\x05\x02" +
		"\x02c\x13\x03\x02\x02\x02de\x07\x04\x02\x02ej\x05\x04\x03\x02fg\x07\x06" +
		"\x02\x02gi\x05\x04\x03\x02hf\x03\x02\x02\x02il\x03\x02\x02\x02jh\x03\x02" +
		"\x02\x02jk\x03\x02\x02\x02km\x03\x02\x02\x02lj\x03\x02\x02\x02mn\x07\x05" +
		"\x02\x02n\x15\x03\x02\x02\x02\v(8>BDK]`j";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!CESQLParserParser.__ATN) {
			CESQLParserParser.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(CESQLParserParser._serializedATN));
		}

		return CESQLParserParser.__ATN;
	}

}

export class CesqlContext extends ParserRuleContext {
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public EOF(): TerminalNode { return this.getToken(CESQLParserParser.EOF, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CESQLParserParser.RULE_cesql; }
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterCesql) {
			listener.enterCesql(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitCesql) {
			listener.exitCesql(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitCesql) {
			return visitor.visitCesql(this);
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
	public get ruleIndex(): number { return CESQLParserParser.RULE_expression; }
	public copyFrom(ctx: ExpressionContext): void {
		super.copyFrom(ctx);
	}
}
export class FunctionInvocationExpressionContext extends ExpressionContext {
	public functionIdentifier(): FunctionIdentifierContext {
		return this.getRuleContext(0, FunctionIdentifierContext);
	}
	public functionParameterList(): FunctionParameterListContext {
		return this.getRuleContext(0, FunctionParameterListContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterFunctionInvocationExpression) {
			listener.enterFunctionInvocationExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitFunctionInvocationExpression) {
			listener.exitFunctionInvocationExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitFunctionInvocationExpression) {
			return visitor.visitFunctionInvocationExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class UnaryLogicExpressionContext extends ExpressionContext {
	public NOT(): TerminalNode { return this.getToken(CESQLParserParser.NOT, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterUnaryLogicExpression) {
			listener.enterUnaryLogicExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitUnaryLogicExpression) {
			listener.exitUnaryLogicExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitUnaryLogicExpression) {
			return visitor.visitUnaryLogicExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class UnaryNumericExpressionContext extends ExpressionContext {
	public MINUS(): TerminalNode { return this.getToken(CESQLParserParser.MINUS, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterUnaryNumericExpression) {
			listener.enterUnaryNumericExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitUnaryNumericExpression) {
			listener.exitUnaryNumericExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitUnaryNumericExpression) {
			return visitor.visitUnaryNumericExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class LikeExpressionContext extends ExpressionContext {
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public LIKE(): TerminalNode { return this.getToken(CESQLParserParser.LIKE, 0); }
	public stringLiteral(): StringLiteralContext {
		return this.getRuleContext(0, StringLiteralContext);
	}
	public NOT(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.NOT, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterLikeExpression) {
			listener.enterLikeExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitLikeExpression) {
			listener.exitLikeExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitLikeExpression) {
			return visitor.visitLikeExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ExistsExpressionContext extends ExpressionContext {
	public EXISTS(): TerminalNode { return this.getToken(CESQLParserParser.EXISTS, 0); }
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterExistsExpression) {
			listener.enterExistsExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitExistsExpression) {
			listener.exitExistsExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitExistsExpression) {
			return visitor.visitExistsExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class InExpressionContext extends ExpressionContext {
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public IN(): TerminalNode { return this.getToken(CESQLParserParser.IN, 0); }
	public setExpression(): SetExpressionContext {
		return this.getRuleContext(0, SetExpressionContext);
	}
	public NOT(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.NOT, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterInExpression) {
			listener.enterInExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitInExpression) {
			listener.exitInExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitInExpression) {
			return visitor.visitInExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class BinaryMultiplicativeExpressionContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public STAR(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.STAR, 0); }
	public DIVIDE(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.DIVIDE, 0); }
	public MODULE(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.MODULE, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterBinaryMultiplicativeExpression) {
			listener.enterBinaryMultiplicativeExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitBinaryMultiplicativeExpression) {
			listener.exitBinaryMultiplicativeExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitBinaryMultiplicativeExpression) {
			return visitor.visitBinaryMultiplicativeExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class BinaryAdditiveExpressionContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public PLUS(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.PLUS, 0); }
	public MINUS(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.MINUS, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterBinaryAdditiveExpression) {
			listener.enterBinaryAdditiveExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitBinaryAdditiveExpression) {
			listener.exitBinaryAdditiveExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitBinaryAdditiveExpression) {
			return visitor.visitBinaryAdditiveExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class BinaryComparisonExpressionContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public EQUAL(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.EQUAL, 0); }
	public NOT_EQUAL(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.NOT_EQUAL, 0); }
	public LESS_GREATER(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.LESS_GREATER, 0); }
	public GREATER_OR_EQUAL(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.GREATER_OR_EQUAL, 0); }
	public LESS_OR_EQUAL(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.LESS_OR_EQUAL, 0); }
	public LESS(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.LESS, 0); }
	public GREATER(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.GREATER, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterBinaryComparisonExpression) {
			listener.enterBinaryComparisonExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitBinaryComparisonExpression) {
			listener.exitBinaryComparisonExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitBinaryComparisonExpression) {
			return visitor.visitBinaryComparisonExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class BinaryLogicExpressionContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public AND(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.AND, 0); }
	public OR(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.OR, 0); }
	public XOR(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.XOR, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterBinaryLogicExpression) {
			listener.enterBinaryLogicExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitBinaryLogicExpression) {
			listener.exitBinaryLogicExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitBinaryLogicExpression) {
			return visitor.visitBinaryLogicExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class SubExpressionContext extends ExpressionContext {
	public LR_BRACKET(): TerminalNode { return this.getToken(CESQLParserParser.LR_BRACKET, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RR_BRACKET(): TerminalNode { return this.getToken(CESQLParserParser.RR_BRACKET, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterSubExpression) {
			listener.enterSubExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitSubExpression) {
			listener.exitSubExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
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
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterAtomExpression) {
			listener.enterAtomExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitAtomExpression) {
			listener.exitAtomExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitAtomExpression) {
			return visitor.visitAtomExpression(this);
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
	public get ruleIndex(): number { return CESQLParserParser.RULE_atom; }
	public copyFrom(ctx: AtomContext): void {
		super.copyFrom(ctx);
	}
}
export class BooleanAtomContext extends AtomContext {
	public booleanLiteral(): BooleanLiteralContext {
		return this.getRuleContext(0, BooleanLiteralContext);
	}
	constructor(ctx: AtomContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterBooleanAtom) {
			listener.enterBooleanAtom(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitBooleanAtom) {
			listener.exitBooleanAtom(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitBooleanAtom) {
			return visitor.visitBooleanAtom(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class IntegerAtomContext extends AtomContext {
	public integerLiteral(): IntegerLiteralContext {
		return this.getRuleContext(0, IntegerLiteralContext);
	}
	constructor(ctx: AtomContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterIntegerAtom) {
			listener.enterIntegerAtom(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitIntegerAtom) {
			listener.exitIntegerAtom(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitIntegerAtom) {
			return visitor.visitIntegerAtom(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class StringAtomContext extends AtomContext {
	public stringLiteral(): StringLiteralContext {
		return this.getRuleContext(0, StringLiteralContext);
	}
	constructor(ctx: AtomContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterStringAtom) {
			listener.enterStringAtom(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitStringAtom) {
			listener.exitStringAtom(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitStringAtom) {
			return visitor.visitStringAtom(this);
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
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterIdentifierAtom) {
			listener.enterIdentifierAtom(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitIdentifierAtom) {
			listener.exitIdentifierAtom(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitIdentifierAtom) {
			return visitor.visitIdentifierAtom(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class IdentifierContext extends ParserRuleContext {
	public IDENTIFIER(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.IDENTIFIER, 0); }
	public IDENTIFIER_WITH_NUMBER(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.IDENTIFIER_WITH_NUMBER, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CESQLParserParser.RULE_identifier; }
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterIdentifier) {
			listener.enterIdentifier(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitIdentifier) {
			listener.exitIdentifier(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitIdentifier) {
			return visitor.visitIdentifier(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class FunctionIdentifierContext extends ParserRuleContext {
	public IDENTIFIER(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.IDENTIFIER, 0); }
	public FUNCTION_IDENTIFIER_WITH_UNDERSCORE(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.FUNCTION_IDENTIFIER_WITH_UNDERSCORE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CESQLParserParser.RULE_functionIdentifier; }
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterFunctionIdentifier) {
			listener.enterFunctionIdentifier(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitFunctionIdentifier) {
			listener.exitFunctionIdentifier(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitFunctionIdentifier) {
			return visitor.visitFunctionIdentifier(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class BooleanLiteralContext extends ParserRuleContext {
	public TRUE(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.TRUE, 0); }
	public FALSE(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.FALSE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CESQLParserParser.RULE_booleanLiteral; }
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterBooleanLiteral) {
			listener.enterBooleanLiteral(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitBooleanLiteral) {
			listener.exitBooleanLiteral(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitBooleanLiteral) {
			return visitor.visitBooleanLiteral(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class StringLiteralContext extends ParserRuleContext {
	public DQUOTED_STRING_LITERAL(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.DQUOTED_STRING_LITERAL, 0); }
	public SQUOTED_STRING_LITERAL(): TerminalNode | undefined { return this.tryGetToken(CESQLParserParser.SQUOTED_STRING_LITERAL, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CESQLParserParser.RULE_stringLiteral; }
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterStringLiteral) {
			listener.enterStringLiteral(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitStringLiteral) {
			listener.exitStringLiteral(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitStringLiteral) {
			return visitor.visitStringLiteral(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class IntegerLiteralContext extends ParserRuleContext {
	public INTEGER_LITERAL(): TerminalNode { return this.getToken(CESQLParserParser.INTEGER_LITERAL, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CESQLParserParser.RULE_integerLiteral; }
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterIntegerLiteral) {
			listener.enterIntegerLiteral(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitIntegerLiteral) {
			listener.exitIntegerLiteral(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitIntegerLiteral) {
			return visitor.visitIntegerLiteral(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class FunctionParameterListContext extends ParserRuleContext {
	public LR_BRACKET(): TerminalNode { return this.getToken(CESQLParserParser.LR_BRACKET, 0); }
	public RR_BRACKET(): TerminalNode { return this.getToken(CESQLParserParser.RR_BRACKET, 0); }
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(CESQLParserParser.COMMA);
		} else {
			return this.getToken(CESQLParserParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CESQLParserParser.RULE_functionParameterList; }
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterFunctionParameterList) {
			listener.enterFunctionParameterList(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitFunctionParameterList) {
			listener.exitFunctionParameterList(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitFunctionParameterList) {
			return visitor.visitFunctionParameterList(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class SetExpressionContext extends ParserRuleContext {
	public LR_BRACKET(): TerminalNode { return this.getToken(CESQLParserParser.LR_BRACKET, 0); }
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public RR_BRACKET(): TerminalNode { return this.getToken(CESQLParserParser.RR_BRACKET, 0); }
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(CESQLParserParser.COMMA);
		} else {
			return this.getToken(CESQLParserParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CESQLParserParser.RULE_setExpression; }
	// @Override
	public enterRule(listener: CESQLParserListener): void {
		if (listener.enterSetExpression) {
			listener.enterSetExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CESQLParserListener): void {
		if (listener.exitSetExpression) {
			listener.exitSetExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CESQLParserVisitor<Result>): Result {
		if (visitor.visitSetExpression) {
			return visitor.visitSetExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}



// Generated from src/models/filters/sql/CESQLParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";

import { FunctionInvocationExpressionContext } from "./CESQLParserParser";
import { UnaryLogicExpressionContext } from "./CESQLParserParser";
import { UnaryNumericExpressionContext } from "./CESQLParserParser";
import { LikeExpressionContext } from "./CESQLParserParser";
import { ExistsExpressionContext } from "./CESQLParserParser";
import { InExpressionContext } from "./CESQLParserParser";
import { BinaryMultiplicativeExpressionContext } from "./CESQLParserParser";
import { BinaryAdditiveExpressionContext } from "./CESQLParserParser";
import { BinaryComparisonExpressionContext } from "./CESQLParserParser";
import { BinaryLogicExpressionContext } from "./CESQLParserParser";
import { SubExpressionContext } from "./CESQLParserParser";
import { AtomExpressionContext } from "./CESQLParserParser";
import { BooleanAtomContext } from "./CESQLParserParser";
import { IntegerAtomContext } from "./CESQLParserParser";
import { StringAtomContext } from "./CESQLParserParser";
import { IdentifierAtomContext } from "./CESQLParserParser";
import { CesqlContext } from "./CESQLParserParser";
import { ExpressionContext } from "./CESQLParserParser";
import { AtomContext } from "./CESQLParserParser";
import { IdentifierContext } from "./CESQLParserParser";
import { FunctionIdentifierContext } from "./CESQLParserParser";
import { BooleanLiteralContext } from "./CESQLParserParser";
import { StringLiteralContext } from "./CESQLParserParser";
import { IntegerLiteralContext } from "./CESQLParserParser";
import { FunctionParameterListContext } from "./CESQLParserParser";
import { SetExpressionContext } from "./CESQLParserParser";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `CESQLParserParser`.
 */
export interface CESQLParserListener extends ParseTreeListener {
	/**
	 * Enter a parse tree produced by the `functionInvocationExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterFunctionInvocationExpression?: (ctx: FunctionInvocationExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `functionInvocationExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitFunctionInvocationExpression?: (ctx: FunctionInvocationExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `unaryLogicExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterUnaryLogicExpression?: (ctx: UnaryLogicExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `unaryLogicExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitUnaryLogicExpression?: (ctx: UnaryLogicExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `unaryNumericExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterUnaryNumericExpression?: (ctx: UnaryNumericExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `unaryNumericExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitUnaryNumericExpression?: (ctx: UnaryNumericExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `likeExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterLikeExpression?: (ctx: LikeExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `likeExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitLikeExpression?: (ctx: LikeExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `existsExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterExistsExpression?: (ctx: ExistsExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `existsExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitExistsExpression?: (ctx: ExistsExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `inExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterInExpression?: (ctx: InExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `inExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitInExpression?: (ctx: InExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `binaryMultiplicativeExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterBinaryMultiplicativeExpression?: (ctx: BinaryMultiplicativeExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `binaryMultiplicativeExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitBinaryMultiplicativeExpression?: (ctx: BinaryMultiplicativeExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `binaryAdditiveExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterBinaryAdditiveExpression?: (ctx: BinaryAdditiveExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `binaryAdditiveExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitBinaryAdditiveExpression?: (ctx: BinaryAdditiveExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `binaryComparisonExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterBinaryComparisonExpression?: (ctx: BinaryComparisonExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `binaryComparisonExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitBinaryComparisonExpression?: (ctx: BinaryComparisonExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `binaryLogicExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterBinaryLogicExpression?: (ctx: BinaryLogicExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `binaryLogicExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitBinaryLogicExpression?: (ctx: BinaryLogicExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `subExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterSubExpression?: (ctx: SubExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `subExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitSubExpression?: (ctx: SubExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `atomExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterAtomExpression?: (ctx: AtomExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `atomExpression`
	 * labeled alternative in `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitAtomExpression?: (ctx: AtomExpressionContext) => void;

	/**
	 * Enter a parse tree produced by the `booleanAtom`
	 * labeled alternative in `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	enterBooleanAtom?: (ctx: BooleanAtomContext) => void;
	/**
	 * Exit a parse tree produced by the `booleanAtom`
	 * labeled alternative in `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	exitBooleanAtom?: (ctx: BooleanAtomContext) => void;

	/**
	 * Enter a parse tree produced by the `integerAtom`
	 * labeled alternative in `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	enterIntegerAtom?: (ctx: IntegerAtomContext) => void;
	/**
	 * Exit a parse tree produced by the `integerAtom`
	 * labeled alternative in `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	exitIntegerAtom?: (ctx: IntegerAtomContext) => void;

	/**
	 * Enter a parse tree produced by the `stringAtom`
	 * labeled alternative in `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	enterStringAtom?: (ctx: StringAtomContext) => void;
	/**
	 * Exit a parse tree produced by the `stringAtom`
	 * labeled alternative in `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	exitStringAtom?: (ctx: StringAtomContext) => void;

	/**
	 * Enter a parse tree produced by the `identifierAtom`
	 * labeled alternative in `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	enterIdentifierAtom?: (ctx: IdentifierAtomContext) => void;
	/**
	 * Exit a parse tree produced by the `identifierAtom`
	 * labeled alternative in `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	exitIdentifierAtom?: (ctx: IdentifierAtomContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.cesql`.
	 * @param ctx the parse tree
	 */
	enterCesql?: (ctx: CesqlContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.cesql`.
	 * @param ctx the parse tree
	 */
	exitCesql?: (ctx: CesqlContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	enterExpression?: (ctx: ExpressionContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.expression`.
	 * @param ctx the parse tree
	 */
	exitExpression?: (ctx: ExpressionContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	enterAtom?: (ctx: AtomContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.atom`.
	 * @param ctx the parse tree
	 */
	exitAtom?: (ctx: AtomContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.identifier`.
	 * @param ctx the parse tree
	 */
	enterIdentifier?: (ctx: IdentifierContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.identifier`.
	 * @param ctx the parse tree
	 */
	exitIdentifier?: (ctx: IdentifierContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.functionIdentifier`.
	 * @param ctx the parse tree
	 */
	enterFunctionIdentifier?: (ctx: FunctionIdentifierContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.functionIdentifier`.
	 * @param ctx the parse tree
	 */
	exitFunctionIdentifier?: (ctx: FunctionIdentifierContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.booleanLiteral`.
	 * @param ctx the parse tree
	 */
	enterBooleanLiteral?: (ctx: BooleanLiteralContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.booleanLiteral`.
	 * @param ctx the parse tree
	 */
	exitBooleanLiteral?: (ctx: BooleanLiteralContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.stringLiteral`.
	 * @param ctx the parse tree
	 */
	enterStringLiteral?: (ctx: StringLiteralContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.stringLiteral`.
	 * @param ctx the parse tree
	 */
	exitStringLiteral?: (ctx: StringLiteralContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.integerLiteral`.
	 * @param ctx the parse tree
	 */
	enterIntegerLiteral?: (ctx: IntegerLiteralContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.integerLiteral`.
	 * @param ctx the parse tree
	 */
	exitIntegerLiteral?: (ctx: IntegerLiteralContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.functionParameterList`.
	 * @param ctx the parse tree
	 */
	enterFunctionParameterList?: (ctx: FunctionParameterListContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.functionParameterList`.
	 * @param ctx the parse tree
	 */
	exitFunctionParameterList?: (ctx: FunctionParameterListContext) => void;

	/**
	 * Enter a parse tree produced by `CESQLParserParser.setExpression`.
	 * @param ctx the parse tree
	 */
	enterSetExpression?: (ctx: SetExpressionContext) => void;
	/**
	 * Exit a parse tree produced by `CESQLParserParser.setExpression`.
	 * @param ctx the parse tree
	 */
	exitSetExpression?: (ctx: SetExpressionContext) => void;
}


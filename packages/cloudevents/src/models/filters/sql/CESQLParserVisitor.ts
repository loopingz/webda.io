// Generated from src/models/filters/sql/CESQLParser.g4 by ANTLR 4.9.0-SNAPSHOT

import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor.js";

import { FunctionInvocationExpressionContext } from "./CESQLParserParser.js";
import { UnaryLogicExpressionContext } from "./CESQLParserParser.js";
import { UnaryNumericExpressionContext } from "./CESQLParserParser.js";
import { LikeExpressionContext } from "./CESQLParserParser.js";
import { ExistsExpressionContext } from "./CESQLParserParser.js";
import { InExpressionContext } from "./CESQLParserParser.js";
import { BinaryMultiplicativeExpressionContext } from "./CESQLParserParser.js";
import { BinaryAdditiveExpressionContext } from "./CESQLParserParser.js";
import { BinaryComparisonExpressionContext } from "./CESQLParserParser.js";
import { BinaryLogicExpressionContext } from "./CESQLParserParser.js";
import { SubExpressionContext } from "./CESQLParserParser.js";
import { AtomExpressionContext } from "./CESQLParserParser.js";
import { BooleanAtomContext } from "./CESQLParserParser.js";
import { IntegerAtomContext } from "./CESQLParserParser.js";
import { StringAtomContext } from "./CESQLParserParser.js";
import { IdentifierAtomContext } from "./CESQLParserParser.js";
import { CesqlContext } from "./CESQLParserParser.js";
import { ExpressionContext } from "./CESQLParserParser.js";
import { AtomContext } from "./CESQLParserParser.js";
import { IdentifierContext } from "./CESQLParserParser.js";
import { FunctionIdentifierContext } from "./CESQLParserParser.js";
import { BooleanLiteralContext } from "./CESQLParserParser.js";
import { StringLiteralContext } from "./CESQLParserParser.js";
import { IntegerLiteralContext } from "./CESQLParserParser.js";
import { FunctionParameterListContext } from "./CESQLParserParser.js";
import { SetExpressionContext } from "./CESQLParserParser.js";

/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `CESQLParserParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export interface CESQLParserVisitor<Result> extends ParseTreeVisitor<Result> {
  /**
   * Visit a parse tree produced by the `functionInvocationExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunctionInvocationExpression?: (ctx: FunctionInvocationExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `unaryLogicExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitUnaryLogicExpression?: (ctx: UnaryLogicExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `unaryNumericExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitUnaryNumericExpression?: (ctx: UnaryNumericExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `likeExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitLikeExpression?: (ctx: LikeExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `existsExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitExistsExpression?: (ctx: ExistsExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `inExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitInExpression?: (ctx: InExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `binaryMultiplicativeExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBinaryMultiplicativeExpression?: (ctx: BinaryMultiplicativeExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `binaryAdditiveExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBinaryAdditiveExpression?: (ctx: BinaryAdditiveExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `binaryComparisonExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBinaryComparisonExpression?: (ctx: BinaryComparisonExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `binaryLogicExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBinaryLogicExpression?: (ctx: BinaryLogicExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `subExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitSubExpression?: (ctx: SubExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `atomExpression`
   * labeled alternative in `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitAtomExpression?: (ctx: AtomExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `booleanAtom`
   * labeled alternative in `CESQLParserParser.atom`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBooleanAtom?: (ctx: BooleanAtomContext) => Result;

  /**
   * Visit a parse tree produced by the `integerAtom`
   * labeled alternative in `CESQLParserParser.atom`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIntegerAtom?: (ctx: IntegerAtomContext) => Result;

  /**
   * Visit a parse tree produced by the `stringAtom`
   * labeled alternative in `CESQLParserParser.atom`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStringAtom?: (ctx: StringAtomContext) => Result;

  /**
   * Visit a parse tree produced by the `identifierAtom`
   * labeled alternative in `CESQLParserParser.atom`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIdentifierAtom?: (ctx: IdentifierAtomContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.cesql`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitCesql?: (ctx: CesqlContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitExpression?: (ctx: ExpressionContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.atom`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitAtom?: (ctx: AtomContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.identifier`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIdentifier?: (ctx: IdentifierContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.functionIdentifier`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunctionIdentifier?: (ctx: FunctionIdentifierContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.booleanLiteral`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBooleanLiteral?: (ctx: BooleanLiteralContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.stringLiteral`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStringLiteral?: (ctx: StringLiteralContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.integerLiteral`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIntegerLiteral?: (ctx: IntegerLiteralContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.functionParameterList`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunctionParameterList?: (ctx: FunctionParameterListContext) => Result;

  /**
   * Visit a parse tree produced by `CESQLParserParser.setExpression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitSetExpression?: (ctx: SetExpressionContext) => Result;
}

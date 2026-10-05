// Generated from src/WebdaQLParser.g4 by ANTLR 4.9.0-SNAPSHOT

import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor.js";

import { LikeExpressionContext } from "./WebdaQLParserParser.js";
import { InExpressionContext } from "./WebdaQLParserParser.js";
import { ContainsExpressionContext } from "./WebdaQLParserParser.js";
import { IsNullExpressionContext } from "./WebdaQLParserParser.js";
import { IsNotNullExpressionContext } from "./WebdaQLParserParser.js";
import { BinaryComparisonExpressionContext } from "./WebdaQLParserParser.js";
import { AndLogicExpressionContext } from "./WebdaQLParserParser.js";
import { OrLogicExpressionContext } from "./WebdaQLParserParser.js";
import { SubExpressionContext } from "./WebdaQLParserParser.js";
import { AtomExpressionContext } from "./WebdaQLParserParser.js";
import { BooleanAtomContext } from "./WebdaQLParserParser.js";
import { IntegerAtomContext } from "./WebdaQLParserParser.js";
import { NumberAtomContext } from "./WebdaQLParserParser.js";
import { StringAtomContext } from "./WebdaQLParserParser.js";
import { ValuesAtomContext } from "./WebdaQLParserParser.js";
import { IdentifierAtomContext } from "./WebdaQLParserParser.js";
import { WebdaqlContext } from "./WebdaQLParserParser.js";
import { LimitExpressionContext } from "./WebdaQLParserParser.js";
import { OffsetExpressionContext } from "./WebdaQLParserParser.js";
import { OrderFieldExpressionContext } from "./WebdaQLParserParser.js";
import { OrderExpressionContext } from "./WebdaQLParserParser.js";
import { ExpressionContext } from "./WebdaQLParserParser.js";
import { ValuesContext } from "./WebdaQLParserParser.js";
import { AtomContext } from "./WebdaQLParserParser.js";
import { IdentifierContext } from "./WebdaQLParserParser.js";
import { BooleanLiteralContext } from "./WebdaQLParserParser.js";
import { StringLiteralContext } from "./WebdaQLParserParser.js";
import { IntegerLiteralContext } from "./WebdaQLParserParser.js";
import { NumberLiteralContext } from "./WebdaQLParserParser.js";
import { ParameterContext } from "./WebdaQLParserParser.js";
import { SetExpressionContext } from "./WebdaQLParserParser.js";

/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `WebdaQLParserParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export interface WebdaQLParserVisitor<Result> extends ParseTreeVisitor<Result> {
  /**
   * Visit a parse tree produced by the `likeExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitLikeExpression?: (ctx: LikeExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `inExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitInExpression?: (ctx: InExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `containsExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitContainsExpression?: (ctx: ContainsExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `isNullExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIsNullExpression?: (ctx: IsNullExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `isNotNullExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIsNotNullExpression?: (ctx: IsNotNullExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `binaryComparisonExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBinaryComparisonExpression?: (ctx: BinaryComparisonExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `andLogicExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitAndLogicExpression?: (ctx: AndLogicExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `orLogicExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitOrLogicExpression?: (ctx: OrLogicExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `subExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitSubExpression?: (ctx: SubExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `atomExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitAtomExpression?: (ctx: AtomExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `booleanAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBooleanAtom?: (ctx: BooleanAtomContext) => Result;

  /**
   * Visit a parse tree produced by the `integerAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIntegerAtom?: (ctx: IntegerAtomContext) => Result;

  /**
   * Visit a parse tree produced by the `numberAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitNumberAtom?: (ctx: NumberAtomContext) => Result;

  /**
   * Visit a parse tree produced by the `stringAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStringAtom?: (ctx: StringAtomContext) => Result;

  /**
   * Visit a parse tree produced by the `valuesAtom`
   * labeled alternative in `WebdaQLParserParser.atom`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitValuesAtom?: (ctx: ValuesAtomContext) => Result;

  /**
   * Visit a parse tree produced by the `identifierAtom`
   * labeled alternative in `WebdaQLParserParser.atom`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIdentifierAtom?: (ctx: IdentifierAtomContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.webdaql`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitWebdaql?: (ctx: WebdaqlContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.limitExpression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitLimitExpression?: (ctx: LimitExpressionContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.offsetExpression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitOffsetExpression?: (ctx: OffsetExpressionContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.orderFieldExpression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitOrderFieldExpression?: (ctx: OrderFieldExpressionContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.orderExpression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitOrderExpression?: (ctx: OrderExpressionContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitExpression?: (ctx: ExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `values`
   * labeled alternative in `WebdaQLParserParser.expressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionvaluesvaluesvaluesvaluesatomatom`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitValues?: (ctx: ValuesContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.atom`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitAtom?: (ctx: AtomContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.identifier`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIdentifier?: (ctx: IdentifierContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.booleanLiteral`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBooleanLiteral?: (ctx: BooleanLiteralContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.stringLiteral`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStringLiteral?: (ctx: StringLiteralContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.integerLiteral`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIntegerLiteral?: (ctx: IntegerLiteralContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.numberLiteral`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitNumberLiteral?: (ctx: NumberLiteralContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.parameter`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitParameter?: (ctx: ParameterContext) => Result;

  /**
   * Visit a parse tree produced by `WebdaQLParserParser.setExpression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitSetExpression?: (ctx: SetExpressionContext) => Result;
}

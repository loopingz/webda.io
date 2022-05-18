// Generated from src/stores/webdaql/WebdaQLParser.g4 by ANTLR 4.9.0-SNAPSHOT

import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";
import {
  AndLogicExpressionContext,
  AtomContext,
  AtomExpressionContext,
  BinaryComparisonExpressionContext,
  BooleanAtomContext,
  BooleanLiteralContext,
  ExpressionContext,
  IdentifierAtomContext,
  IdentifierContext,
  InExpressionContext,
  IntegerAtomContext,
  IntegerLiteralContext,
  LikeExpressionContext,
  LimitExpressionContext,
  OffsetExpressionContext,
  OrderExpressionContext,
  OrderFieldExpressionContext,
  OrLogicExpressionContext,
  SetExpressionContext,
  StringAtomContext,
  StringLiteralContext,
  SubExpressionContext,
  ValuesAtomContext,
  ValuesContext,
  WebdaqlContext
} from "./WebdaQLParserParser";

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
   * labeled alternative in `WebdaQLParserParser.expressionexpressionexpressionexpressionexpressionexpressionexpressionvaluesvaluesvaluesatomatom`.
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
   * Visit a parse tree produced by `WebdaQLParserParser.setExpression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitSetExpression?: (ctx: SetExpressionContext) => Result;
}

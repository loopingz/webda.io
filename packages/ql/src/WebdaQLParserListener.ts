// Generated from src/WebdaQLParser.g4 by ANTLR 4.9.0-SNAPSHOT

import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener.js";

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
 * This interface defines a complete listener for a parse tree produced by
 * `WebdaQLParserParser`.
 */
export interface WebdaQLParserListener extends ParseTreeListener {
  /**
   * Enter a parse tree produced by the `likeExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterLikeExpression?: (ctx: LikeExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `likeExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitLikeExpression?: (ctx: LikeExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `inExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterInExpression?: (ctx: InExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `inExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitInExpression?: (ctx: InExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `containsExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterContainsExpression?: (ctx: ContainsExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `containsExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitContainsExpression?: (ctx: ContainsExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `isNullExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterIsNullExpression?: (ctx: IsNullExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `isNullExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitIsNullExpression?: (ctx: IsNullExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `isNotNullExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterIsNotNullExpression?: (ctx: IsNotNullExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `isNotNullExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitIsNotNullExpression?: (ctx: IsNotNullExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `binaryComparisonExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterBinaryComparisonExpression?: (ctx: BinaryComparisonExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `binaryComparisonExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitBinaryComparisonExpression?: (ctx: BinaryComparisonExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `andLogicExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterAndLogicExpression?: (ctx: AndLogicExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `andLogicExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitAndLogicExpression?: (ctx: AndLogicExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `orLogicExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterOrLogicExpression?: (ctx: OrLogicExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `orLogicExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitOrLogicExpression?: (ctx: OrLogicExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `subExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterSubExpression?: (ctx: SubExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `subExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitSubExpression?: (ctx: SubExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `atomExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterAtomExpression?: (ctx: AtomExpressionContext) => void;
  /**
   * Exit a parse tree produced by the `atomExpression`
   * labeled alternative in `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitAtomExpression?: (ctx: AtomExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `booleanAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   */
  enterBooleanAtom?: (ctx: BooleanAtomContext) => void;
  /**
   * Exit a parse tree produced by the `booleanAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   */
  exitBooleanAtom?: (ctx: BooleanAtomContext) => void;

  /**
   * Enter a parse tree produced by the `integerAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   */
  enterIntegerAtom?: (ctx: IntegerAtomContext) => void;
  /**
   * Exit a parse tree produced by the `integerAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   */
  exitIntegerAtom?: (ctx: IntegerAtomContext) => void;

  /**
   * Enter a parse tree produced by the `numberAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   */
  enterNumberAtom?: (ctx: NumberAtomContext) => void;
  /**
   * Exit a parse tree produced by the `numberAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   */
  exitNumberAtom?: (ctx: NumberAtomContext) => void;

  /**
   * Enter a parse tree produced by the `stringAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   */
  enterStringAtom?: (ctx: StringAtomContext) => void;
  /**
   * Exit a parse tree produced by the `stringAtom`
   * labeled alternative in `WebdaQLParserParser.values`.
   * @param ctx the parse tree
   */
  exitStringAtom?: (ctx: StringAtomContext) => void;

  /**
   * Enter a parse tree produced by the `valuesAtom`
   * labeled alternative in `WebdaQLParserParser.atom`.
   * @param ctx the parse tree
   */
  enterValuesAtom?: (ctx: ValuesAtomContext) => void;
  /**
   * Exit a parse tree produced by the `valuesAtom`
   * labeled alternative in `WebdaQLParserParser.atom`.
   * @param ctx the parse tree
   */
  exitValuesAtom?: (ctx: ValuesAtomContext) => void;

  /**
   * Enter a parse tree produced by the `identifierAtom`
   * labeled alternative in `WebdaQLParserParser.atom`.
   * @param ctx the parse tree
   */
  enterIdentifierAtom?: (ctx: IdentifierAtomContext) => void;
  /**
   * Exit a parse tree produced by the `identifierAtom`
   * labeled alternative in `WebdaQLParserParser.atom`.
   * @param ctx the parse tree
   */
  exitIdentifierAtom?: (ctx: IdentifierAtomContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.webdaql`.
   * @param ctx the parse tree
   */
  enterWebdaql?: (ctx: WebdaqlContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.webdaql`.
   * @param ctx the parse tree
   */
  exitWebdaql?: (ctx: WebdaqlContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.limitExpression`.
   * @param ctx the parse tree
   */
  enterLimitExpression?: (ctx: LimitExpressionContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.limitExpression`.
   * @param ctx the parse tree
   */
  exitLimitExpression?: (ctx: LimitExpressionContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.offsetExpression`.
   * @param ctx the parse tree
   */
  enterOffsetExpression?: (ctx: OffsetExpressionContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.offsetExpression`.
   * @param ctx the parse tree
   */
  exitOffsetExpression?: (ctx: OffsetExpressionContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.orderFieldExpression`.
   * @param ctx the parse tree
   */
  enterOrderFieldExpression?: (ctx: OrderFieldExpressionContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.orderFieldExpression`.
   * @param ctx the parse tree
   */
  exitOrderFieldExpression?: (ctx: OrderFieldExpressionContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.orderExpression`.
   * @param ctx the parse tree
   */
  enterOrderExpression?: (ctx: OrderExpressionContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.orderExpression`.
   * @param ctx the parse tree
   */
  exitOrderExpression?: (ctx: OrderExpressionContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  enterExpression?: (ctx: ExpressionContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.expression`.
   * @param ctx the parse tree
   */
  exitExpression?: (ctx: ExpressionContext) => void;

  /**
   * Enter a parse tree produced by the `values`
   * labeled alternative in `WebdaQLParserParser.expressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionvaluesvaluesvaluesvaluesatomatom`.
   * @param ctx the parse tree
   */
  enterValues?: (ctx: ValuesContext) => void;
  /**
   * Exit a parse tree produced by the `values`
   * labeled alternative in `WebdaQLParserParser.expressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionvaluesvaluesvaluesvaluesatomatom`.
   * @param ctx the parse tree
   */
  exitValues?: (ctx: ValuesContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.atom`.
   * @param ctx the parse tree
   */
  enterAtom?: (ctx: AtomContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.atom`.
   * @param ctx the parse tree
   */
  exitAtom?: (ctx: AtomContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.identifier`.
   * @param ctx the parse tree
   */
  enterIdentifier?: (ctx: IdentifierContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.identifier`.
   * @param ctx the parse tree
   */
  exitIdentifier?: (ctx: IdentifierContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.booleanLiteral`.
   * @param ctx the parse tree
   */
  enterBooleanLiteral?: (ctx: BooleanLiteralContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.booleanLiteral`.
   * @param ctx the parse tree
   */
  exitBooleanLiteral?: (ctx: BooleanLiteralContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.stringLiteral`.
   * @param ctx the parse tree
   */
  enterStringLiteral?: (ctx: StringLiteralContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.stringLiteral`.
   * @param ctx the parse tree
   */
  exitStringLiteral?: (ctx: StringLiteralContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.integerLiteral`.
   * @param ctx the parse tree
   */
  enterIntegerLiteral?: (ctx: IntegerLiteralContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.integerLiteral`.
   * @param ctx the parse tree
   */
  exitIntegerLiteral?: (ctx: IntegerLiteralContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.numberLiteral`.
   * @param ctx the parse tree
   */
  enterNumberLiteral?: (ctx: NumberLiteralContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.numberLiteral`.
   * @param ctx the parse tree
   */
  exitNumberLiteral?: (ctx: NumberLiteralContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.parameter`.
   * @param ctx the parse tree
   */
  enterParameter?: (ctx: ParameterContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.parameter`.
   * @param ctx the parse tree
   */
  exitParameter?: (ctx: ParameterContext) => void;

  /**
   * Enter a parse tree produced by `WebdaQLParserParser.setExpression`.
   * @param ctx the parse tree
   */
  enterSetExpression?: (ctx: SetExpressionContext) => void;
  /**
   * Exit a parse tree produced by `WebdaQLParserParser.setExpression`.
   * @param ctx the parse tree
   */
  exitSetExpression?: (ctx: SetExpressionContext) => void;
}

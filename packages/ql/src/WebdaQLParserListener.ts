// Generated from src/WebdaQLParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";

import { LikeExpressionContext } from "./WebdaQLParserParser";
import { InExpressionContext } from "./WebdaQLParserParser";
import { ContainsExpressionContext } from "./WebdaQLParserParser";
import { BinaryComparisonExpressionContext } from "./WebdaQLParserParser";
import { AndLogicExpressionContext } from "./WebdaQLParserParser";
import { OrLogicExpressionContext } from "./WebdaQLParserParser";
import { SubExpressionContext } from "./WebdaQLParserParser";
import { AtomExpressionContext } from "./WebdaQLParserParser";
import { BooleanAtomContext } from "./WebdaQLParserParser";
import { IntegerAtomContext } from "./WebdaQLParserParser";
import { StringAtomContext } from "./WebdaQLParserParser";
import { ValuesAtomContext } from "./WebdaQLParserParser";
import { IdentifierAtomContext } from "./WebdaQLParserParser";
import { WebdaqlContext } from "./WebdaQLParserParser";
import { StatementContext } from "./WebdaQLParserParser";
import { DeleteStatementContext } from "./WebdaQLParserParser";
import { UpdateStatementContext } from "./WebdaQLParserParser";
import { SelectStatementContext } from "./WebdaQLParserParser";
import { FilterQueryContext } from "./WebdaQLParserParser";
import { AssignmentListContext } from "./WebdaQLParserParser";
import { AssignmentContext } from "./WebdaQLParserParser";
import { FieldListContext } from "./WebdaQLParserParser";
import { LimitExpressionContext } from "./WebdaQLParserParser";
import { OffsetExpressionContext } from "./WebdaQLParserParser";
import { OrderFieldExpressionContext } from "./WebdaQLParserParser";
import { OrderExpressionContext } from "./WebdaQLParserParser";
import { ExpressionContext } from "./WebdaQLParserParser";
import { ValuesContext } from "./WebdaQLParserParser";
import { AtomContext } from "./WebdaQLParserParser";
import { IdentifierContext } from "./WebdaQLParserParser";
import { BooleanLiteralContext } from "./WebdaQLParserParser";
import { StringLiteralContext } from "./WebdaQLParserParser";
import { IntegerLiteralContext } from "./WebdaQLParserParser";
import { SetExpressionContext } from "./WebdaQLParserParser";


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
	 * Enter a parse tree produced by `WebdaQLParserParser.statement`.
	 * @param ctx the parse tree
	 */
	enterStatement?: (ctx: StatementContext) => void;
	/**
	 * Exit a parse tree produced by `WebdaQLParserParser.statement`.
	 * @param ctx the parse tree
	 */
	exitStatement?: (ctx: StatementContext) => void;

	/**
	 * Enter a parse tree produced by `WebdaQLParserParser.deleteStatement`.
	 * @param ctx the parse tree
	 */
	enterDeleteStatement?: (ctx: DeleteStatementContext) => void;
	/**
	 * Exit a parse tree produced by `WebdaQLParserParser.deleteStatement`.
	 * @param ctx the parse tree
	 */
	exitDeleteStatement?: (ctx: DeleteStatementContext) => void;

	/**
	 * Enter a parse tree produced by `WebdaQLParserParser.updateStatement`.
	 * @param ctx the parse tree
	 */
	enterUpdateStatement?: (ctx: UpdateStatementContext) => void;
	/**
	 * Exit a parse tree produced by `WebdaQLParserParser.updateStatement`.
	 * @param ctx the parse tree
	 */
	exitUpdateStatement?: (ctx: UpdateStatementContext) => void;

	/**
	 * Enter a parse tree produced by `WebdaQLParserParser.selectStatement`.
	 * @param ctx the parse tree
	 */
	enterSelectStatement?: (ctx: SelectStatementContext) => void;
	/**
	 * Exit a parse tree produced by `WebdaQLParserParser.selectStatement`.
	 * @param ctx the parse tree
	 */
	exitSelectStatement?: (ctx: SelectStatementContext) => void;

	/**
	 * Enter a parse tree produced by `WebdaQLParserParser.filterQuery`.
	 * @param ctx the parse tree
	 */
	enterFilterQuery?: (ctx: FilterQueryContext) => void;
	/**
	 * Exit a parse tree produced by `WebdaQLParserParser.filterQuery`.
	 * @param ctx the parse tree
	 */
	exitFilterQuery?: (ctx: FilterQueryContext) => void;

	/**
	 * Enter a parse tree produced by `WebdaQLParserParser.assignmentList`.
	 * @param ctx the parse tree
	 */
	enterAssignmentList?: (ctx: AssignmentListContext) => void;
	/**
	 * Exit a parse tree produced by `WebdaQLParserParser.assignmentList`.
	 * @param ctx the parse tree
	 */
	exitAssignmentList?: (ctx: AssignmentListContext) => void;

	/**
	 * Enter a parse tree produced by `WebdaQLParserParser.assignment`.
	 * @param ctx the parse tree
	 */
	enterAssignment?: (ctx: AssignmentContext) => void;
	/**
	 * Exit a parse tree produced by `WebdaQLParserParser.assignment`.
	 * @param ctx the parse tree
	 */
	exitAssignment?: (ctx: AssignmentContext) => void;

	/**
	 * Enter a parse tree produced by `WebdaQLParserParser.fieldList`.
	 * @param ctx the parse tree
	 */
	enterFieldList?: (ctx: FieldListContext) => void;
	/**
	 * Exit a parse tree produced by `WebdaQLParserParser.fieldList`.
	 * @param ctx the parse tree
	 */
	exitFieldList?: (ctx: FieldListContext) => void;

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
	 * labeled alternative in `WebdaQLParserParser.expressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionvaluesvaluesvaluesatomatom`.
	 * @param ctx the parse tree
	 */
	enterValues?: (ctx: ValuesContext) => void;
	/**
	 * Exit a parse tree produced by the `values`
	 * labeled alternative in `WebdaQLParserParser.expressionexpressionexpressionexpressionexpressionexpressionexpressionexpressionvaluesvaluesvaluesatomatom`.
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


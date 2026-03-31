grammar WebdaQLParser;

import WebdaQLLexer;

// Entrypoint — a statement or a plain filter query
webdaql: (statement | filterQuery) EOF;

// Statement types
statement
    : deleteStatement
    | updateStatement
    | selectStatement
    ;

// DELETE [WHERE <condition>] [LIMIT n]
deleteStatement: DELETE (WHERE expression)? limitExpression?;

// UPDATE SET <assignments> [WHERE <condition>] [LIMIT n]
updateStatement: UPDATE SET assignmentList (WHERE expression)? limitExpression?;

// SELECT <fields> [WHERE <condition>] [ORDER BY ...] [LIMIT ...] [OFFSET ...]
selectStatement: SELECT fieldList (WHERE expression)? orderExpression? limitExpression? offsetExpression?;

// Implicit SELECT (comma-separated field list without SELECT keyword)
// is handled at the parser/runtime level since it requires disambiguation
// from plain filter expressions

// Plain filter query (original grammar entry point)
filterQuery: expression? orderExpression? limitExpression? offsetExpression?;

// Assignment list for UPDATE SET
assignmentList: assignment (COMMA assignment)*;
assignment: identifier EQUAL values;

// Field list for SELECT
fieldList: identifier (COMMA identifier)*;

limitExpression: LIMIT integerLiteral;
offsetExpression: OFFSET stringLiteral;
orderFieldExpression: identifier (ASC | DESC)?;
orderExpression: ORDER_BY orderFieldExpression ( COMMA orderFieldExpression )*;

// Structure of operations, function invocations and expression
expression
    :
    // LIKE, EXISTS and IN takes precedence over all the other binary operators
    identifier LIKE stringLiteral #likeExpression
    | identifier IN setExpression #inExpression
    | identifier CONTAINS stringLiteral #containsExpression
    // Comparison operations
    | identifier (EQUAL | NOT_EQUAL | GREATER_OR_EQUAL | LESS_OR_EQUAL | LESS | GREATER) values #binaryComparisonExpression
    // Logic operations
    | expression AND expression #andLogicExpression
    | expression OR expression #orLogicExpression
    // Subexpressions and atoms
    | LR_BRACKET expression RR_BRACKET #subExpression
    | atom #atomExpression
    ;

values
    : booleanLiteral #booleanAtom
    | integerLiteral #integerAtom
    | stringLiteral #stringAtom
    ;

atom
    : values #valuesAtom
    | identifier #identifierAtom
    ;

// Identifiers

identifier
    : (IDENTIFIER | IDENTIFIER_WITH_NUMBER)
    ;

// Literals

booleanLiteral: (TRUE | FALSE);
stringLiteral: (DQUOTED_STRING_LITERAL | SQUOTED_STRING_LITERAL);
integerLiteral: INTEGER_LITERAL;


// Sets

setExpression
    : LR_SQ_BRACKET values ( COMMA values )* RR_SQ_BRACKET // Empty sets are not allowed
    ;

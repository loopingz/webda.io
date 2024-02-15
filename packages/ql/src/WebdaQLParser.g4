grammar WebdaQLParser;

import WebdaQLLexer;

// Entrypoint
webdaql: expression? orderExpression? limitExpression? offsetExpression? EOF;

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
grammar WebdaQLParser;

import WebdaQLLexer;

// Entrypoint
webdaql: expression? orderExpression? limitExpression? offsetExpression? EOF;

limitExpression: LIMIT (integerLiteral | parameter);
offsetExpression: OFFSET (stringLiteral | parameter);
orderFieldExpression: identifier (ASC | DESC)?;
orderExpression: ORDER_BY orderFieldExpression ( COMMA orderFieldExpression )*;

// Structure of operations, function invocations and expression
expression
    :
    // LIKE, EXISTS and IN takes precedence over all the other binary operators
    identifier LIKE (stringLiteral | parameter) #likeExpression
    | identifier IN (setExpression | parameter) #inExpression
    | identifier CONTAINS (stringLiteral | parameter) #containsExpression
    // IS NULL / IS NOT NULL
    | identifier IS NULL #isNullExpression
    | identifier IS NOT NULL #isNotNullExpression
    // Comparison operations
    | identifier (EQUAL | NOT_EQUAL | GREATER_OR_EQUAL | LESS_OR_EQUAL | LESS | GREATER) (values | parameter) #binaryComparisonExpression
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
    | numberLiteral #numberAtom
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
numberLiteral: NUMBER_LITERAL;

// Parameters: only allowed where a value is expected, bound before evaluation

parameter: (POSITIONAL_PARAMETER | NAMED_PARAMETER);

// Sets

setExpression
    : LR_SQ_BRACKET (values | parameter) ( COMMA (values | parameter) )* RR_SQ_BRACKET // Empty sets are not allowed
    ;

lexer grammar WebdaQLLexer;

// Case-insensitive keyword fragments

fragment A: [aA];
fragment B: [bB];
fragment C: [cC];
fragment D: [dD];
fragment E: [eE];
fragment F: [fF];
fragment G: [gG];
fragment H: [hH];
fragment I: [iI];
fragment K: [kK];
fragment L: [lL];
fragment M: [mM];
fragment N: [nN];
fragment O: [oO];
fragment P: [pP];
fragment R: [rR];
fragment S: [sS];
fragment T: [tT];
fragment U: [uU];
fragment W: [wW];
fragment Y: [yY];

// Skip tab, carriage return and newlines

SPACE:                               [ \t\r\n]+    -> skip;

// Fragments for Literal primitives

fragment ID_LITERAL:                 [a-zA-Z0-9]+;
fragment DQUOTA_STRING:              '"' ( '\\'. | '""' | ~('"'| '\\') )* '"';
fragment SQUOTA_STRING:              '\'' ('\\'. | '\'\'' | ~('\'' | '\\'))* '\'';
fragment INT_DIGIT:                  [0-9];
fragment FN_LITERAL:                 [A-Z] [A-Z_]*;

// Constructors symbols

LR_BRACKET:                          '(';
RR_BRACKET:                          ')';
COMMA:                               ',';
SINGLE_QUOTE_SYMB:                   '\'';
DOUBLE_QUOTE_SYMB:                   '"';
LR_SQ_BRACKET:                          '[';
RR_SQ_BRACKET:                          ']';

fragment QUOTE_SYMB
    : SINGLE_QUOTE_SYMB | DOUBLE_QUOTE_SYMB
    ;

// Statement keywords

DELETE: D E L E T E;
UPDATE: U P D A T E;
SELECT: S E L E C T;
SET: S E T;
WHERE: W H E R E;

// Operators
// - Logic

AND: A N D;
OR: O R;

// - Comparison

EQUAL:                        '=';
NOT_EQUAL:                    '!=';
GREATER:                      '>';
GREATER_OR_EQUAL:             '>=';
LESS:                         '<';
LESS_OR_EQUAL:                '<=';

// Like, exists, in

LIKE: L I K E;
IN: I N;
CONTAINS: C O N T A I N S;

// Booleans

TRUE: T R U E;
FALSE: F A L S E;

// Limit
LIMIT: L I M I T;
OFFSET: O F F S E T;

// Order by
ORDER_BY: O R D E R ' ' B Y;
ASC: A S C;
DESC: D E S C;

// Literals

DQUOTED_STRING_LITERAL:                      DQUOTA_STRING;
SQUOTED_STRING_LITERAL:                      SQUOTA_STRING;
INTEGER_LITERAL:                             INT_DIGIT+;

// Identifiers

IDENTIFIER:                                 [a-zA-Z]+;
IDENTIFIER_WITH_NUMBER: [a-zA-Z0-9._]+;
FUNCTION_IDENTIFIER_WITH_UNDERSCORE:                        [A-Z] [A-Z_]*;

// Types for template literal handler tests
export type Method = 'GET' | 'POST';
export type Segment = 'users' | 'admin';
export type Action = 'list' | 'detail';
export type Route = `${Method} /${Segment}/${Action}`; // should enumerate all combos
export type WithNumber = `id-${number}`; // should become pattern
export type WithNumMixed = `id-${'X'|'Y'}-${number}`; // union then number -> pattern fallback (not full enumeration)

CREATE TABLE IF NOT EXISTS public.idents
(
    uuid uuid NOT NULL,
    data jsonb,
    CONSTRAINT idents_pkey PRIMARY KEY (uuid)
);

CREATE TABLE IF NOT EXISTS public.users
(
    uuid uuid NOT NULL,
    data jsonb,
    CONSTRAINT users_pkey PRIMARY KEY (uuid)
);

GRANT ALL ON TABLE public.users TO "webda.io";
GRANT ALL ON TABLE public.idents TO "webda.io";
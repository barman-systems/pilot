create extension if not exists vector with schema extensions;
create extension if not exists pgtap with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgaudit;
alter role authenticator set pgaudit.log to 'write';

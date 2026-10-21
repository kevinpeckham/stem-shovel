# DAWproject schemas

`Project.xsd` and `MetaData.xsd` are Bitwig's schemas for the DAWproject
format, copied from github.com/bitwig/dawproject (MIT, see LICENSE) on
2026-10-21. `src/lib/utils/dawproject.test.ts` validates what Dawn's
writer produces against them (libxml2-wasm), so an element out of order
or an attribute the format does not have fails the unit tests rather
than an import in Cubase.

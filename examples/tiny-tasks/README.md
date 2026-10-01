# Tiny Tasks

An illustrative source-only project included with Code Atlas. It is a teaching fixture, not a production application. Do not install its placeholder dependency versions.

Read `app/page.tsx` for the screen, `components/TaskForm.tsx` for the interaction, `app/api/tasks/route.ts` for the request, and `lib/validation.ts` and `lib/tasks.ts` for the work.

Try asking: Where does the task title come from? What happens with an empty title? Will tasks survive a server restart?

`lib/validation.test.ts` contains real, isolated validation tests. With Node.js 22.6+ you can run them without installing this fixture's placeholder dependencies:

```sh
node --experimental-strip-types --test lib/validation.test.ts
```

Code Atlas discovers and displays these tests but never runs an opened repository's scripts automatically.

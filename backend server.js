// Compatibility entry point. The complete backend lives in server.js.
// Keeping one server implementation prevents route and database behavior from drifting.
require("./server");
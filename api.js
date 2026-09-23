const API_BASE = window.location.protocol === "file:"
    ? "http://localhost:5000"
    : "";

function apiUrl(path) {
    return API_BASE + path;
}

async function readApiResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let data;

    if (contentType.includes("application/json")) {
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error("Server returned invalid JSON.");
        }
    } else {
        throw new Error(
            response.status === 404
                ? "Requested API endpoint was not found. Please refresh the page."
                : response.ok
                    ? "Server returned an unexpected HTML response. Open the page through http://localhost:5000."
                    : `Server error (${response.status}). Please restart the backend.`
        );
    }

    if (!response.ok) {
        throw new Error(data.message || "Request failed.");
    }

    return data;
}

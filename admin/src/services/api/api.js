import { useAuth } from "@clerk/clerk-react";

const BASE_URL = import.meta.env.VITE_API_URL;

export const apiRequest = async (
    endPoint,
    method = "GET",
    body = null,
    token = null
) => {
    const options = {
        method,
        headers: {
            "Content-Type": "application/json",
        },
    };

    // Attach token
    if (token) {
        options.headers["Authorization"] = `Bearer ${token}`;
    }

    if (body) {
        options.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE_URL}${endPoint}`, options);

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "API request failed");
    }

    return res.json();
};

export const useApi = () => {
    const { getToken } = useAuth();

    const request = async (
        endPoint,
        method = "GET",
        body = null
    ) => {
        const token = await getToken();

        return apiRequest(
            endPoint,
            method,
            body,
            token
        );
    };

    return { request };
};
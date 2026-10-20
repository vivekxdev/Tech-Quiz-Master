import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");
    } catch (error) {
        // Fail fast (Render reports the service as crashed and restarts it)
        // without printing the driver message: a malformed connection string
        // error can echo the URI — credentials included — into the logs. The
        // error *name* (e.g. MongoServerSelectionError) is enough to debug
        // from the dashboard. This also prevents the previously-unhandled
        // rejection from crashing Node with a raw stack trace.
        console.error("MongoDB connection failed:", error?.name || "Error");
        process.exit(1);
    }
};

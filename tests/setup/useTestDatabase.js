/*
	Runs before each test file: point the app's database client at the test
	database. dotenv never overrides a variable that is already set, so the
	app's config picks this up.
*/
import dotenv from "dotenv";


dotenv.config({ quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

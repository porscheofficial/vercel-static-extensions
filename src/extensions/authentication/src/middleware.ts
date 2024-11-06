import { auth } from "./auth.config";

export default auth((req: Request) => {
	const url = new URL(req.url);
	// @ts-expect-error Will be injected from auth()
	if (!req.auth && url.pathname !== "/login") {
		const newUrl = new URL("/api/auth/signin", url.origin);
		return Response.redirect(newUrl);
	}
});

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

# @porscheofficial/vercel-static-extensions
 
A plug-and-play solution to implement authentication through Entra ID for static sites hosted on Vercel.
This is only relevant for specific use cases, where the static assets are generated during the build and not known in advance.
This package implements the Vercel Build Output API to explicitly define which assets to deploy on which infrastructure, otherwise Vercel might not recognize API Routes as such and deploys them as static assets.

## How to use it

1. Install the package:

```bash
npm install @porscheofficial/vercel-static-extensions
```

2. Add the following script to your `package.json`:

*PNPM has issues with `postbuild`, in that case, just exec the script as part of your build script.*

```json
{
  "scripts": {
    "postbuild": "vercel-static-extensions"
  }
}
```

3. Optionally create your configuration file: `vercel-static-extensions.config.json`

```json
{
  "staticDirectory": "build",
  "extensions": {
    "authentication": {
      "provider": "microsoft-entra-id",
      "environmentVariables": {
        "AUTH_MICROSOFT_ENTRA_CLIENT_ID": "AUTH_MICROSOFT_ENTRA_CLIENT_ID1",
        "AUTH_MICROSOFT_ENTRA_ID_SECRET": "AUTH_MICROSOFT_ENTRA_ID_SECRET2",
        "AUTH_MICROSOFT_ENTRA_ID_TENANT_ID": "AUTH_MICROSOFT_ENTRA_ID_TENANT_ID2",
        "AUTH_MICROSOFT_ENTRA_ID_REDIRECT_URI": "AUTH_MICROSOFT_ENTRA_ID_REDIRECT_URI2"
      }
    }
  }
}
```

4. Create or update the `vercel.json` file:

```json
{
  "routes": [
    {
      "src": "/api/auth/(.*)",
      "dest": "/api/auth/[...nextauth]/route.js"
    }
  ]
}
```

### What does the script do?

The script does the following:

* Move the static files into `.vercel/output/static`
* Create `.vercel/output/functions` with the Authentication API routes and Middlelayer functions
* Create `.vercel/output/config.json` with the routes configuration

## Limitations

This script is intended to add an authentication layer to static sites hosted on Vercel.
It's highly opinionated and might not work for all use cases.

## Why is this script necessary?

We faced challenges deploying static assets with API routes created during build time, such as with the [Technology Radar](https://github.com/porscheofficial/porschedigital-technology-radar), to Vercel.
This script explicitly defines which assets to deploy on which infrastructure.

#### First try
During the build process, we created a directory `/build` and moved the functions to `/build/api`.
Unfortunately, Vercel treated all files in that build directory as static files and didn't execute the functions.

#### Second try
We created a `vercel.json` and referenced the API Directory. This resulted in an error, because the API Directory is not part of the repository but is only created during build time.
The `vercel.json` File seems to be interpreted before the build.

#### Third try
We created the API directory in the root of the repository (`/api`) and let Vercel transpile the typescript files.
Unfortunately, this resulted in an error because `next-auth` uses `__dirname` which is not available in the Edge Environment (Middleware).
Running esbuild manually allows to replace the `__dirname` variable.

#### Fourth try – Working Alternative
Following the first approach, we created the API directory within the build directory (`/build/api`), but with the difference that we did that via Github Actions and only then pushed the artifacts to Vercel.
That means, after the build, we cd into the build directory (`/build`) and then run the CLI `vercel deploy`.
That works because then all the assets are already there, and Vercel correctly interprets the API files as functions.
The downside of this approach is that we do not leverage Vercel Build Infrastructure.

#### Solution
We decided implement the Vercel Output API to tell Vercel exactly how to run our artifacts.
By doing that, it is possible to create the assets during build time on Vercel's Infrastructure and then deploy them correctly.

## License

See [LICENSE.md](LICENSE.md) for more information.

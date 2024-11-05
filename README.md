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
    "postbuild": "@porscheofficial/vercel-static-extensions"
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

## License

See [LICENSE.md](LICENSE.md) for more information.

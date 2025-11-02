# Phase two

Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.

Sparkle needs to be bundled into an NPM Pack .tgz file. This allows the .tgz itself to be added to the customer's git repo and thus included for the team.

When the sparkle pack is added to the repo, it should start a sparkle agent. This is a node instance that opens a localhost-only port for management.

The sparkle configuration should use a custom field in the git root's package.json. The field should be named "sparkle_config" and it holds an object shaped like this: {"git_branch":<branch name>, "directory":<path_relative_to_git_root>}

When Sparkle is invoked, it starts a node process that will continue running as a daemon. The node process is sparkle_agent.js and imports sparkle.js.

sparkle.js is the what performs the Sparkle operations. sparkle_agent.js is the agent which accepts the calls from a web-service API and calls sparkle.js. Separation of concerns.

Lastly, sparkle_client_launch.js is invoked by `npm run sparkle` to cause a browser page to launch, and is described later.

When the daemon starts, it will either find or not find an existing configuration in the package.json

If there is a configuration, it will perform the normal startup procedure and fail if anything is wrong. Startup procedure defined below.

If there is not a configuration, it will perform the following one-time initialization.

** ONE TIME INITIALIZATION **

Launch a web server on an ephemeral port bound only to localhost and then launch a browser for the configuration.html page.

This page must prompt for the fields needed in the package.json described above.

It also asks permission to add the ability to interactively run `npm run sparkle` to start a client to Sparkle.

Once it has them, it will:
1. create and enable a sparkle branch without changing the current git branch. The branch will be from the last git commit in origin/. It will find this commit. If it can't, it will report an error and let the user kill it.

2. in the sparkle branch it will create the directory requested

3. in the sparkle branch it will create a .gitignore in the new directory with an entry for last_port.data

4. in the sparkle branch It will create a last_port.data file and in it place the port number of the current web server.

5. in the sparkle branch it will do add of the .gitignore, commit, and push to origin establishing a tracking branch

6. it will trigger 'git fetch'

7. it will update the package.json in the working branch with the data entered, now that setup is done and recommend to the user to commit the changes. If the user requested to enable `npm run sparkle` it will create the scripts field if needed and then add the code to launch a sparkle CLIENT when `npm run sparkle` happens. When they hit OK, the page will close.

At this point, Sparkle is live in the git repo and pushed remotely, anyone who fetches/pulls will receive the branch.

The node agent will then advance to ** NORMAL OPERATIONS **

** NORMAL STARTUP PROCEDURE **

When the node starts, it uses the package.json in the root of the git clone to find its directory and branch. It does a git fetch and then examines the sparkle directory's last_port.data. If the file doesn't exist, it is not an error and is treated as if the attempt to connect to the port number failed. It attempts to connect to that port. If it succeeds, the node server shuts down. This avoids multiple agents running in the same repo.

If the node can't connect to the port number, it creates a webserver on a random ephemeral port and writes that into the last_port.data file, creating it if needed.

The server now advances to ** NORMAL OPERATIONS **

** NORMAL OPERATIONS **

Sparkle expects to be invoked via a web request. It can either let a user interact with a webpage or it can allow another program to send requests.

If the user allowed it, a sparkle_client_launch.js can be invoked that knows how to find the last_port.data and invoke the browser on the user operation page. NOTE: if it tries to find that port, and the port isn't active, it needs to tell the user that sparkle isn't running and exit.

In either case, sparkle works as a web server.

The user operation page exposes the curent status of sparkle, and will be continually updated in the development process of sparkle itself.

The user operation page invokes the same web-service API that external services would invoke.

Each Sparkle public API call should have a web-service that takes the arguments. Notice that Sparkle's operational API doesn't request things like user identity, so these API calls don't either. It's also always local-host.

The sparkle's API setBaseDirectory is not exported via the web API. The users can't alter the sparkle config.

Any additions to the sparkle.js public API will require updates to the sparkle_agent.js to enable them to be called.

When Sparkle state is updated via any API call the agent will add any new file as needed to the sparkle branch git repo and then commit and push.

In this way, the sparkle branch is pushed per change.

The agent should fetch after each push, and every 10 minutes. There should also be on the user operation page the means to trigger a git fetch.

The user operation screen should poll the agent for changes every 5 seconds (its localhost and cheap). To support this poll, the agent should have an API that stores the last time a fetch reported that data changed, if ever. The client will pass its last stored change to the API call, and teh API call will report whether the client should refresh or not. If theclient needs to refresh, it should do so on a field basis, NOT refreshing the whole page, so that if a user is typing the refresh doesn't interfere with them or cause any loss.

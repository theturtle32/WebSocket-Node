#!/bin/bash

# Copy .gitconfig from host if available, making it writable in the container
if [ -f "/tmp/host-gitconfig" ]; then
    cp /tmp/host-gitconfig /home/node/.gitconfig
    chown node:node /home/node/.gitconfig
    chmod 644 /home/node/.gitconfig
    echo "Copied .gitconfig from host (now writable in container)"
else
    echo "No .gitconfig found on host, will create new one"
    touch /home/node/.gitconfig
    chown node:node /home/node/.gitconfig
fi

# Copy GitHub CLI config from host if available and doesn't already exist
if [ -d "/tmp/host-gh-config" ] && [ ! -d "/home/node/.config/gh" ]; then
    mkdir -p /home/node/.config
    cp -r /tmp/host-gh-config /home/node/.config/gh
    chown -R node:node /home/node/.config/gh
    chmod -R 600 /home/node/.config/gh/*
    chmod 700 /home/node/.config/gh
    echo "Copied GitHub CLI config from host (now writable in container)"
elif [ -d "/home/node/.config/gh" ]; then
    echo "GitHub CLI config already exists in container, skipping copy"
elif [ ! -d "/tmp/host-gh-config" ]; then
    echo "No GitHub CLI config found on host"
fi

# Disable GPG signing if no GPG key is configured to avoid the ssh-keygen error
if ! git config --global user.signingkey >/dev/null 2>&1; then
    git config --global commit.gpgsign false
    git config --global tag.gpgsign false
fi

# Create a script to detect and set the correct editor
cat > /home/node/.set-git-editor.sh << 'EOF'
#!/bin/bash
# Detect Cursor vs VS Code based on more reliable indicators
if [[ -d "/home/node/.cursor-server" ]] || [[ "$VSCODE_GIT_ASKPASS_MAIN" == *"cursor-server"* ]]; then
    export GIT_EDITOR="cursor --wait"
    git config --global core.editor "cursor --wait" 2>/dev/null || true
elif command -v code >/dev/null 2>&1; then
    export GIT_EDITOR="code --wait"
    git config --global core.editor "code --wait" 2>/dev/null || true
else
    export GIT_EDITOR="vim"
    git config --global core.editor "vim" 2>/dev/null || true
fi
EOF

chmod +x /home/node/.set-git-editor.sh

# Add the script to be sourced on every shell startup
echo 'source ~/.set-git-editor.sh' >> ~/.bashrc
echo 'source ~/.set-git-editor.sh' >> ~/.zshrc 2>/dev/null || true

# Run it now for the current session
source /home/node/.set-git-editor.sh

echo "Git editor detection script installed"

# Copy essential SSH files from host (selective copy for security)
# Only copies: known_hosts and all default SSH identity files
# Identity files: id_rsa, id_ecdsa, id_ecdsa_sk, id_ed25519, id_ed25519_sk, id_dsa
# Does NOT copy: config, authorized_keys, or other potentially sensitive files
if [ -d "/tmp/host-ssh" ]; then
    mkdir -p /home/node/.ssh
    chmod 700 /home/node/.ssh
    chown node:node /home/node/.ssh
    
    # Copy known_hosts if it exists
    if [ -f "/tmp/host-ssh/known_hosts" ]; then
        cp /tmp/host-ssh/known_hosts /home/node/.ssh/
        chmod 644 /home/node/.ssh/known_hosts
        chown node:node /home/node/.ssh/known_hosts
        echo "Copied SSH known_hosts"
    fi
    
    # Copy default identity keys if they exist (all SSH default identity files)
    for key_type in id_rsa id_ecdsa id_ecdsa_sk id_ed25519 id_ed25519_sk id_dsa; do
        if [ -f "/tmp/host-ssh/$key_type" ]; then
            cp "/tmp/host-ssh/$key_type" /home/node/.ssh/
            chmod 600 "/home/node/.ssh/$key_type"
            chown node:node "/home/node/.ssh/$key_type"
            echo "Copied SSH private key: $key_type"
        fi
        if [ -f "/tmp/host-ssh/$key_type.pub" ]; then
            cp "/tmp/host-ssh/$key_type.pub" /home/node/.ssh/
            chmod 644 "/home/node/.ssh/$key_type.pub"
            chown node:node "/home/node/.ssh/$key_type.pub"
            echo "Copied SSH public key: $key_type.pub"
        fi
    done
    
    echo "SSH key setup complete (selective copy)"
else
    echo "No SSH directory found on host"
fi

# Verify GitHub CLI authentication
if command -v gh >/dev/null 2>&1; then
    echo "GitHub CLI is available"
    if gh auth status >/dev/null 2>&1; then
        echo "GitHub CLI is authenticated"
        gh auth status
    else
        echo "GitHub CLI is not authenticated. After container rebuild, You should run:"
        echo '$ gh auth login'
    fi
fi

# Make sure the volume mount for node modules and pnpm home is writable
sudo chown -R node:node /workspace/node_modules

# Install pnpm (package manager) as the node user
export PNPM_HOME="/pnpm"
export PATH="$PNPM_HOME:$PATH"
sudo mkdir -p $PNPM_HOME
sudo chown -R node:node $PNPM_HOME
curl -fsSL https://get.pnpm.io/install.sh | sudo -u node PNPM_HOME="/pnpm" PATH="$PNPM_HOME:$PATH" SHELL=zsh sh -

# Install dependencies (CI=true avoids prompting for confirmation)
sudo -u node bash -c 'cd /workspace && CI=true pnpm install'

./init-firewall.sh

echo "Dev container setup complete!" 
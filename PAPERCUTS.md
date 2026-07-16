# Papercuts

- `git log --show-signature` reports `No signature` when `gpg.ssh.allowedSignersFile` is unset, even if the commit contains an SSH `gpgsig`; inspect the raw commit or configure allowed signers before relying on that output.

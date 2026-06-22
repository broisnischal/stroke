fn main() {
    // Load .env from the workspace root for local development.
    // In CI, these vars are set directly in the environment (GitHub Actions secrets).
    // dotenvy::dotenv() walks up from the current dir to find the file — it is
    // intentionally silent if .env is missing (CI case).
    dotenvy::dotenv().ok();

    // Forward GitHub OAuth credentials into the compiled binary.
    // `env!("VAR")` in src/ reads these at compile time.
    // Build fails loudly if either var is missing in both .env and the environment.
    for var in ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] {
        match std::env::var(var) {
            Ok(val) => println!("cargo:rustc-env={var}={val}"),
            Err(_) => panic!(
                "\n\nMissing required build env var: {var}\n\
                 Add it to .env (local) or set it as a CI/CD secret.\n\
                 See .env.example for the expected format.\n"
            ),
        }
        println!("cargo:rerun-if-env-changed={var}");
    }

    // Re-run when .env itself changes.
    println!("cargo:rerun-if-changed=../.env");

    tauri_build::build()
}

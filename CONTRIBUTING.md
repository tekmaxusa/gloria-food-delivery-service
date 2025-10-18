# Contributing to Gloria Food Delivery Service

Thank you for your interest in contributing to the Gloria Food Delivery Service! This document provides guidelines for contributing to this project.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Git
- Basic knowledge of TypeScript/JavaScript

### Development Setup

1. **Fork the repository**
   ```bash
   # Click the "Fork" button on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/gloria-food-delivery-service.git
   cd gloria-food-delivery-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a development branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Set up environment**
   ```bash
   cp env.example .env
   # Configure your .env file with test credentials
   ```

## 📝 Development Guidelines

### Code Style

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for public methods
- Maintain consistent indentation (2 spaces)
- Use semicolons consistently

### Project Structure

```
src/
├── cli.ts                    # CLI interface
├── index.ts                  # Main entry point
├── services/                 # Service implementations
│   ├── gloria-food-api-client.ts
│   ├── doordash-api-client.ts
│   └── webhook-handler.ts
├── types/                    # TypeScript type definitions
└── utils/                    # Utility functions
```

### Testing

- Write tests for new features
- Ensure existing tests pass
- Test both success and error scenarios
- Use descriptive test names

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 🔧 Development Workflow

### 1. Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, well-documented code
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes**
   ```bash
   npm run build
   npm test
   npm run lint
   ```

### 2. Submitting Changes

1. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

2. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create a Pull Request**
   - Go to your fork on GitHub
   - Click "New Pull Request"
   - Fill out the PR template
   - Request review from maintainers

## 📋 Pull Request Guidelines

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or clearly documented)
```

### Commit Message Format

Use conventional commit messages:

```
type(scope): description

feat(api): add order filtering by date range
fix(webhook): handle malformed webhook payloads
docs(readme): update installation instructions
test(api): add unit tests for order processing
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment Information**
   - Node.js version
   - Operating system
   - Package versions

2. **Steps to Reproduce**
   - Clear, numbered steps
   - Expected vs actual behavior

3. **Error Details**
   - Full error messages
   - Stack traces
   - Log files (if applicable)

4. **Additional Context**
   - Screenshots (if applicable)
   - Related issues
   - Workarounds (if any)

## 💡 Feature Requests

When suggesting new features:

1. **Check existing issues** to avoid duplicates
2. **Describe the problem** you're trying to solve
3. **Provide use cases** and examples
4. **Consider implementation** complexity
5. **Discuss alternatives** you've considered

## 🔍 Code Review Process

### For Contributors

1. **Self-review** your code before submitting
2. **Test thoroughly** with different scenarios
3. **Update documentation** as needed
4. **Respond to feedback** promptly
5. **Make requested changes** clearly

### For Maintainers

1. **Review within 48 hours** when possible
2. **Provide constructive feedback**
3. **Test changes locally** if needed
4. **Approve and merge** when ready
5. **Close related issues** when appropriate

## 🏷️ Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] Release notes prepared
- [ ] GitHub release created

## 📚 Resources

### Documentation

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Winston Logging](https://github.com/winstonjs/winston)

### API References

- [Gloria Food API](https://docs.gloriafood.com/)
- [DoorDash API](https://developer.doordash.com/)

### Tools

- [ESLint](https://eslint.org/) - Code linting
- [Prettier](https://prettier.io/) - Code formatting
- [Jest](https://jestjs.io/) - Testing framework
- [TypeScript](https://www.typescriptlang.org/) - Type checking

## 🤝 Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Follow the golden rule

### Communication

- Use clear, descriptive language
- Be patient with newcomers
- Ask questions when unsure
- Share knowledge generously

## 📞 Getting Help

- 📖 Check the [README](README.md) first
- 🔍 Search existing [Issues](https://github.com/yourusername/gloria-food-delivery-service/issues)
- 💬 Join [Discussions](https://github.com/yourusername/gloria-food-delivery-service/discussions)
- 📧 Contact maintainers directly

## 🙏 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Project documentation

Thank you for contributing to the Gloria Food Delivery Service! 🎉

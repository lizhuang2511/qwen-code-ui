from setuptools import setup, find_packages

setup(
    name="qwen-python-wrapper",
    version="1.0.0",
    description="Python wrapper for the qwen CLI",
    author="Harshit",
    author_email="me@h-s.site",
    packages=find_packages(),
    install_requires=[],
    entry_points={
        'console_scripts': [
            'qwen-python-wrapper=qwen_python_wrapper:main',
        ],
    },
)
